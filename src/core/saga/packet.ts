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

import path from "node:path";
import { readText, pathExists } from "../../utils/fs.js";
import { isSecretLikePath, redactSecretsInText } from "../diff-service.js";
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
  fileHints: string[];
}): Promise<StepPacketFileRead[]> {
  const { worktreePath, fileHints } = input;
  const out: StepPacketFileRead[] = [];
  for (const hint of fileHints) {
    const rel = hint.trim();
    if (!rel) continue;
    const normalized = rel.replace(/\\/g, "/");
    // Refuse anything that could escape the approved root.
    if (normalized.startsWith("/") || normalized.includes("..")) continue;
    if (path.isAbsolute(normalized)) continue;
    if (isSecretLikePath(normalized)) continue;

    const resolved = path.resolve(worktreePath, normalized);
    const insideWorktree =
      resolved === worktreePath || resolved.startsWith(worktreePath + path.sep);
    if (!insideWorktree) continue;

    if (!(await pathExists(resolved))) continue;
    const content = await readText(resolved).catch(() => null);
    if (content == null) continue;
    out.push({ path: normalized, content });
  }
  return out;
}
