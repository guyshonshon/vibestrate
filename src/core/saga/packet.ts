// Curated step packet.
//
// A saga gives each step a FRESH model context. To stop step N from drifting
// from step 2 without re-feeding an ever-growing transcript, the conductor hands
// the fresh session a CURATED packet: a small, fixed set of high-signal sections
// in priority order, every one scrubbed of secrets. This is the anti-rot
// handoff sagas exist to provide.
//
// `buildStepPacket` is a PURE renderer: the caller collects the volatile inputs
// (the accumulated diff, the fresh file reads) and passes them in, so the
// assembly + ordering + redaction + bounding are testable without a git repo.
// `readFreshFileReads` is the one I/O helper - it re-reads the step's file hints
// from the worktree so the packet reflects the CURRENT bytes on disk, not what
// some earlier step remembered.

import fs from "node:fs/promises";
import path from "node:path";
import { readText, pathExists } from "../../utils/fs.js";
import { isSecretLikePath, redactSecretsInText } from "../diff-service.js";
import { resolveSafePath, type AllowedRoot } from "../path-guard.js";
import { renderInvariantsSection } from "./saga-supervisor.js";

/** One step's view, as the packet needs it. Mirrors the saga step fields on a
 *  checklist item (objective / acceptanceCheck / fileHints) plus its position. */
export type StepPacketItem = {
  text: string;
  objective: string;
  acceptanceCheck: string;
  /** 0-based position in the saga. */
  index: number;
  total: number;
  fileHints: string[];
};

export type StepPacketFileRead = {
  path: string;
  content: string;
};

export type BuildStepPacketArgs = {
  /** The saga's stable objective (the run task text / saga description). */
  goal: string;
  /** Compact ledger of completed steps (buildPriorItemsContext output). "" = none. */
  priorItemsContext: string;
  /** Committed work on the feature branch so far (a diff-service helper). "" = none. */
  accumulatedDiff: string;
  /** Current worktree bytes of this step's file hints (readFreshFileReads output). */
  fileReads: StepPacketFileRead[];
  /** This step's objective + acceptance + text. */
  item: StepPacketItem;
  /** The non-folding invariants ledger (task.sagaInvariants). "" / [] = none. */
  invariants?: readonly string[];
};

// Per-axis bounds. The packet is a context budget, not an archive: a marathon
// step's accumulated diff or a huge hinted file must not crowd out the goal +
// this-step sections. Tuned for "enough to ground, not enough to rot".
const MAX_DIFF_CHARS = 12_000;
const MAX_FILE_READ_CHARS = 6_000;
const MAX_TOTAL_FILE_READS_CHARS = 18_000;

function truncate(text: string, max: number): string {
  const flat = text.replace(/\r/g, "");
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).trimEnd()}\n…(truncated at ${max} chars)`;
}

/**
 * Assemble the curated step packet. Sections appear in PRIORITY ORDER and every
 * section is scrubbed with `redactSecretsInText` before it lands in the output,
 * so a secret pasted into the diff, a hinted file, the goal, or the step fields
 * never reaches the provider. Optional sections (prior outcomes, diff, fresh
 * reads) are omitted entirely when empty - no empty-section noise.
 */
export function buildStepPacket(args: BuildStepPacketArgs): string {
  const { goal, priorItemsContext, accumulatedDiff, fileReads, item } = args;
  const invariants = args.invariants ?? [];
  const redact = (s: string): string => redactSecretsInText(s).redacted;

  const parts: string[] = [];

  // 1. Feature goal (stable). Always present - it anchors the whole step.
  parts.push(
    ["## Feature goal", "", redact(goal.trim()) || "_No goal text._"].join("\n"),
  );

  // 1b. The non-folding INVARIANTS ledger: cross-cutting decisions
  // the supervisor recorded, re-injected here - between the goal and the prior
  // outcomes - so conventions don't fold away. Redacted like every other section;
  // omitted entirely when the ledger is empty.
  const invariantsSection = redact(renderInvariantsSection(invariants));
  if (invariantsSection) {
    parts.push(invariantsSection);
  }

  // 2. Prior step outcomes (the compact carried ledger).
  const prior = redact(priorItemsContext.trim());
  if (prior) {
    parts.push(["## Prior step outcomes", "", prior].join("\n"));
  }

  // 3. Accumulated diff so far (committed work on the feature branch, bounded).
  const diff = redact(truncate(accumulatedDiff, MAX_DIFF_CHARS).trim());
  if (diff) {
    parts.push(
      [
        "## Accumulated diff so far",
        "The committed work on this feature branch from completed steps. For context; do NOT redo it.",
        "",
        "```diff",
        diff,
        "```",
      ].join("\n"),
    );
  }

  // 4. Fresh code read (CURRENT worktree bytes of this step's file hints,
  //    bounded per file and in total). Re-read, never remembered.
  const freshBlocks: string[] = [];
  let freshBudget = MAX_TOTAL_FILE_READS_CHARS;
  for (const fr of fileReads) {
    if (freshBudget <= 0) break;
    const perFile = Math.min(MAX_FILE_READ_CHARS, freshBudget);
    const body = redact(truncate(fr.content, perFile));
    freshBudget -= body.length;
    freshBlocks.push([`### ${fr.path}`, "```", body, "```"].join("\n"));
  }
  if (freshBlocks.length > 0) {
    parts.push(
      [
        "## Fresh code read",
        "Current contents of this step's hinted files, re-read from the worktree now.",
        "",
        freshBlocks.join("\n\n"),
      ].join("\n"),
    );
  }

  // 5. This step (objective + acceptance + text). Always present.
  const stepLines = [
    "## This step",
    `Step ${item.index + 1} of ${item.total}.`,
    "",
    redact(item.text.trim()),
  ];
  const objective = redact(item.objective.trim());
  if (objective) {
    stepLines.push("", "Objective:", objective);
  }
  const acceptance = redact(item.acceptanceCheck.trim());
  if (acceptance) {
    stepLines.push("", "Acceptance check:", acceptance);
  }
  stepLines.push(
    "",
    "Focus ONLY on this step. Earlier steps are already done (see prior outcomes); do not redo them, and do not start later steps. Make the smallest change that satisfies this step's acceptance check.",
  );
  parts.push(stepLines.join("\n"));

  return ["# Saga step packet", "", parts.join("\n\n")].join("\n") + "\n";
}

/**
 * Re-read the CURRENT contents of a step's file hints from the worktree. This is
 * what makes the "fresh code read" section honest: it reflects bytes on disk
 * right now, not what an earlier step's transcript said. Bounded per file.
 * Skips cleanly when:
 *  - fileHints is empty,
 *  - a hint escapes the worktree (absolute path or `..` traversal),
 *  - a hint resolves outside the worktree root,
 *  - the file is missing,
 *  - the path looks secret-like (.env, *.key, credentials, ...).
 */
export async function readFreshFileReads(input: {
  worktreePath: string;
  /**
   * Relative directories this run symlinked from the project into the worktree
   * (`RunState.envLinks`). A hint UNDER one of these legitimately reaches the
   * project and nothing else does.
   *
   * It has to be the run's own record. The previous version asked the worktree
   * whether the hint's first segment was a symlink, which is state the run's
   * agent writes: one `ln -s /nonexistent .git` handed back the whole project
   * root, `.git/config` and other runs' artifacts included - the two things the
   * gate names as what it stops. It also only ever looked at the FIRST segment,
   * so every nested link the linker creates (`packages/<name>/node_modules`) was
   * refused, dropping hints silently.
   */
  envLinks: readonly string[];
  /** The project root. Required for containment, because a run worktree is a
   *  SIBLING of the project (`git.worktreeDir` defaults to
   *  `../.vibestrate-worktrees`) and its env dirs are SYMLINKS back into the
   *  project - `node_modules` and `.venv`, linked by default. Judging a hint
   *  against the worktree alone therefore refuses every read through one of
   *  those links, which is a legitimate and common thing for a hint to name. */
  projectRoot: string;
  fileHints: string[];
}): Promise<StepPacketFileRead[]> {
  const { worktreePath, projectRoot, fileHints } = input;
  // Worktree first: a file that exists in both is the run's copy, not the
  // project's. `resolveSafePath` still proves real containment inside whichever
  // root matches, so a link out of BOTH roots stays refused.
  /**
   * Where ONE hint may resolve: a root, and the path to resolve inside it.
   *
   * The worktree always answers. A hint through a linked environment directory
   * cannot be answered there, because linkWorktreeEnvironment symlinks
   * node_modules, .venv and nested packages/<x>/node_modules back into the
   * project and a worktree is a sibling of it, so those leave the worktree root
   * by construction. That case gets a SECOND root.
   *
   * That second root is the linked directory itself, never the project root.
   * The link is what was granted, so the link is the whole grant. Widening it
   * to the project made every project file reachable through one symlink
   * planted INSIDE the linked directory - and a write-capable seat can plant
   * one, because writing through a linked dir into the project's env dir is a
   * documented boundary of the linking feature (see git/worktree-env.ts). A
   * `node_modules/x -> ../.git/config` was approved that way, which is the
   * exact file this gate exists to refuse.
   *
   * The root is built from the PROJECT's copy, which is what the linker points
   * at (its `target` is always `<projectRoot>/<dir>`). Reading it out of the
   * worktree would ask the agent's own disk what the link means.
   *
   * Which dirs are linked comes from the RUN'S OWN RECORD. Asking the
   * worktree's disk instead was defeated by one `ln -s`.
   *
   * Required, not optional: a caller that forgot it would compile, default to
   * none, and drop every hint through a linked directory in silence - which is
   * a bug this gate has already had once.
   */
  const linkedDirs = input.envLinks
    .map((dir) => dir.replace(/\\/g, "/").replace(/\/+$/, ""))
    .filter((dir) => dir !== "" && dir !== "." && !dir.startsWith("/"));
  type Attempt = { root: AllowedRoot; rel: string };
  const attemptsFor = (relPath: string): Attempt[] => {
    const attempts: Attempt[] = [
      {
        root: { kind: "worktree", absolutePath: worktreePath, label: "run worktree" },
        rel: relPath,
      },
    ];
    // Segment-prefix, not first-segment: `packages/app/node_modules` is a dir
    // the linker really creates, and a first-segment test refused every hint
    // under one. Longest match wins, so a nested link is scoped to itself
    // rather than to a shorter one that also matches.
    const dir = linkedDirs
      .filter((d) => relPath === d || relPath.startsWith(d + "/"))
      .sort((a, b) => b.length - a.length)[0];
    if (dir !== undefined) {
      const rest = relPath === dir ? "." : relPath.slice(dir.length + 1);
      attempts.push({
        root: {
          kind: "project",
          absolutePath: path.join(projectRoot, dir),
          label: `linked ${dir}`,
        },
        rel: rest,
      });
    }
    return attempts;
  };
  const out: StepPacketFileRead[] = [];
  for (const hint of fileHints) {
    const rel = hint.trim();
    if (!rel) continue;
    // Leading "./" removed before anything looks at the path: the previous
    // gate keyed on the first segment, so "./x" made that segment "." and
    // slipped past - the same spelling-dodge as the round before it.
    const normalized = rel.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
    if (isSecretLikePath(normalized)) continue;
    // Hints are RELATIVE by contract; an absolute one is refused outright.
    // On its own that refusal bought nothing - the same file was reachable by
    // its relative spelling - so the real containment is the root choice below.
    if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) continue;

    // Containment goes through the project's hardened resolver rather than a
    // string prefix test. The textual version refused "..", an absolute path
    // and anything resolving outside the worktree - and still handed over a
    // file outside it, because none of those checks follow a symlink. A hint
    // named `innocent.md` pointing at `~/.ssh/id_rsa` passed every one of them,
    // and `isSecretLikePath` judges the NAME the model supplied, not the target
    // it lands on. These hints are model-written and the content goes into a
    // durable run artifact, so this is the one place that must not improvise.
    // Each approved root is tried on its own, because containment is proved
    // against the root the path resolved in - so a hint reaching the project
    // through a worktree env link fails against the worktree and succeeds
    // against the project, which is the correct answer and cannot be reached by
    // handing both roots to one call.
    let resolved: string | null = null;
    for (const attempt of attemptsFor(normalized)) {
      try {
        const safe = await resolveSafePath(attempt.rel, [attempt.root]);
        if (safe.isSecretLike) break;
        // The existence test belongs INSIDE the loop: a root that contains the
        // path but holds no such file must not consume the hint, or the run's
        // own copy in the worktree is never reached when the project has the
        // same relative path and neither does.
        if (!(await pathExists(safe.absolutePath))) continue;
        resolved = safe.absolutePath;
        break;
      } catch {
        // Not contained by THIS root; the next one may still approve it, and if
        // none does the hint is dropped.
      }
    }
    if (resolved === null) continue;

    const content = await readText(resolved).catch(() => null);
    if (content == null) continue;
    out.push({ path: normalized, content });
  }
  return out;
}
