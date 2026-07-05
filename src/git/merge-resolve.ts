// ── Supervisor conflict-resolution proposals (Layer 3, read-only) ────────────
//
// For a predicted conflict, ask the supervisor (local provider, the assist path)
// to PROPOSE a merged version of each conflict region. Strictly advisory and
// scratch-only: the proposals are returned for the human to review/edit/accept;
// nothing is written to a real branch and nothing is committed here. The real
// apply of accepted resolutions is a separate, human-gated step (applyResolvedMerge).
//
// Safety: a secret-like PATH is refused outright (manual only); every hunk body
// sent to the provider is run through redactSecretsInText first (correction #7),
// and runAssist redacts the whole assembled prompt again as a backstop. Because
// the provider never sees raw secrets, a redacted token comes back as a
// `[REDACTED:…]` placeholder the human edits before applying - lossy-but-safe.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import { z } from "zod";
import { loadConfig } from "../project/config-loader.js";
import { resolveWorktreePath } from "../utils/paths.js";
import {
  createWorktree,
  removeWorktree,
  deleteBranch,
  mergeNoCommit,
  abortMerge,
  refExists,
} from "./git.js";
import {
  parseConflictHunks,
  rebuildResolvedFile,
  isLikelyBinary,
  type ConflictHunk,
} from "./conflict-parser.js";
import { isSecretLikePath, redactSecretsInText } from "../core/diff-service.js";
import {
  runAssist,
  type AssistProviderRunner,
  type AdHocProvider,
} from "../assist/assist-runner.js";

const SAFE_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/;
const AUDIT_BUCKET = "git-merge";

export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolveError";
  }
}

export type HunkProposal = ConflictHunk & {
  /** The supervisor's proposed merged text for this region (secrets redacted). */
  proposed: string;
  /** One-line rationale from the supervisor. */
  rationale: string;
};

export type FileResolution = {
  file: string;
  status: "proposed" | "refusedSecret" | "binary" | "unparseable";
  hunks: HunkProposal[];
  /**
   * The FULL proposed file: the conflicted file with every conflict region
   * replaced by its proposed resolution and all non-conflict context preserved.
   * This is what the UI seeds + applies - per-hunk text alone would drop the
   * unconflicted lines and silently truncate the file. Null when reconstruction
   * failed (caller falls back to manual).
   */
  proposedFile: string | null;
  note?: string;
};

export type ResolutionProposal = {
  source: string;
  target: string;
  /** True when the merge is clean (nothing to resolve). */
  clean: boolean;
  files: FileResolution[];
};

const hunkResolutionSchema = z.object({
  resolved: z.string(),
  rationale: z.string().default(""),
});

function assertSafeBranch(name: string, role: string): string {
  const trimmed = name.trim();
  if (!SAFE_BRANCH_RE.test(trimmed)) {
    throw new ResolveError(`Invalid ${role} branch name "${name}".`);
  }
  return trimmed;
}

/**
 * Propose per-hunk resolutions for the conflicts of merging `source` into
 * `target`. Read-only: runs in a scratch worktree that is always torn down;
 * never commits, never touches a real branch.
 */
export async function proposeResolutions(input: {
  projectRoot: string;
  source: string;
  target: string;
  profileId?: string | null;
  crewId?: string | null;
  adHocProvider?: AdHocProvider | null;
  /** Test seam for the provider spawn. */
  runner?: AssistProviderRunner;
}): Promise<ResolutionProposal> {
  const source = assertSafeBranch(input.source, "source");
  const target = assertSafeBranch(input.target, "target");
  if (source === target) {
    throw new ResolveError("Source and target are the same branch.");
  }
  const loaded = await loadConfig(input.projectRoot);
  if (!(await refExists(input.projectRoot, target))) {
    throw new ResolveError(`Target branch "${target}" does not exist.`);
  }
  if (!(await refExists(input.projectRoot, source))) {
    throw new ResolveError(`Source branch "${source}" does not exist.`);
  }

  // merge-base for diff3-free base reconstruction (best-effort).
  const mb = await execa("git", ["merge-base", target, source], {
    cwd: input.projectRoot,
    reject: false,
  });
  const mergeBase = mb.exitCode === 0 ? mb.stdout.trim().split("\n")[0] ?? null : null;

  const scratchBranch = `vibe-merge-resolve-${randomUUID().slice(0, 8)}`;
  const scratchPath = resolveWorktreePath(
    input.projectRoot,
    loaded.config.git.worktreeDir,
    scratchBranch,
  );
  await removeWorktree(input.projectRoot, scratchPath);
  await createWorktree({
    cwd: input.projectRoot,
    worktreePath: scratchPath,
    branchName: scratchBranch,
    startPoint: target,
  });
  try {
    const attempt = await mergeNoCommit(scratchPath, source);
    if (attempt.clean) {
      await abortMerge(scratchPath);
      return { source, target, clean: true, files: [] };
    }

    const files: FileResolution[] = [];
    for (const file of attempt.conflictedFiles) {
      // Refuse AI resolution on a secret-like PATH outright (manual only).
      if (isSecretLikePath(file)) {
        files.push({
          file,
          status: "refusedSecret",
          hunks: [],
          proposedFile: null,
          note: "secret-like path - resolve manually, never sent to a provider",
        });
        continue;
      }
      let content: string;
      try {
        content = await fs.readFile(path.join(scratchPath, file), "utf8");
      } catch {
        files.push({
          file,
          status: "unparseable",
          hunks: [],
          proposedFile: null,
          note: "could not read file",
        });
        continue;
      }
      if (isLikelyBinary(content)) {
        files.push({
          file,
          status: "binary",
          hunks: [],
          proposedFile: null,
          note: "binary file - resolve manually",
        });
        continue;
      }
      const parsed = parseConflictHunks(content);
      if (!parsed.ok) {
        files.push({
          file,
          status: "unparseable",
          hunks: [],
          proposedFile: null,
          note: parsed.reason,
        });
        continue;
      }

      const baseContent = mergeBase ? await showFileAt(input.projectRoot, mergeBase, file) : "";
      const hunks: HunkProposal[] = [];
      for (const hunk of parsed.hunks) {
        const proposal = await proposeHunk({
          projectRoot: input.projectRoot,
          loaded,
          file,
          hunk,
          baseContent,
          profileId: input.profileId,
          crewId: input.crewId,
          adHocProvider: input.adHocProvider,
          runner: input.runner,
        });
        hunks.push({ ...hunk, ...proposal });
      }
      // Reconstruct the FULL file: splice each proposed region back into the
      // original, preserving all non-conflict context (per-hunk text alone
      // would truncate the file).
      const rebuilt = rebuildResolvedFile(
        content,
        hunks.map((h) => h.proposed),
      );
      if (!rebuilt.ok) {
        // Can't safely produce a whole file -> downgrade to manual rather than
        // emit a "proposed" file with no proposedFile (which a UI fallback could
        // turn back into a truncating write). A "proposed" file ALWAYS carries a
        // full proposedFile.
        files.push({
          file,
          status: "unparseable",
          hunks: [],
          proposedFile: null,
          note: `could not reconstruct full file (${rebuilt.reason}); resolve manually`,
        });
        continue;
      }
      files.push({
        file,
        status: "proposed",
        hunks,
        proposedFile: rebuilt.file,
      });
    }
    return { source, target, clean: false, files };
  } finally {
    await abortMerge(scratchPath).catch(() => {});
    await removeWorktree(input.projectRoot, scratchPath);
    await deleteBranch(input.projectRoot, scratchBranch);
  }
}

async function showFileAt(
  projectRoot: string,
  rev: string,
  file: string,
): Promise<string> {
  const r = await execa("git", ["show", `${rev}:${file}`], {
    cwd: projectRoot,
    reject: false,
  });
  return r.exitCode === 0 ? r.stdout : "";
}

async function proposeHunk(args: {
  projectRoot: string;
  loaded: Awaited<ReturnType<typeof loadConfig>>;
  file: string;
  hunk: ConflictHunk;
  baseContent: string;
  profileId?: string | null;
  crewId?: string | null;
  adHocProvider?: AdHocProvider | null;
  runner?: AssistProviderRunner;
}): Promise<{ proposed: string; rationale: string }> {
  // Redact each side BEFORE it reaches the prompt (defense in depth; runAssist
  // also redacts the full prompt). The proposal can only ever echo redacted text.
  const ours = redactSecretsInText(args.hunk.ours).redacted;
  const theirs = redactSecretsInText(args.hunk.theirs).redacted;
  const base = redactSecretsInText(args.hunk.base ?? args.baseContent).redacted;

  const instruction = [
    `Resolve one merge conflict in "${args.file}". Combine the two sides into the`,
    "single correct merged result. Return ONLY the merged text for this region",
    "(no conflict markers, no fences).",
    "",
    "## base (common ancestor)",
    base || "(empty / file absent at base)",
    "",
    "## ours",
    ours || "(empty)",
    "",
    "## theirs",
    theirs || "(empty)",
  ].join("\n");

  const result = await runAssist({
    projectRoot: args.projectRoot,
    label: "git-merge:resolve",
    instruction,
    schema: hunkResolutionSchema,
    schemaHint: '{ "resolved": "<merged text for this region>", "rationale": "<one line>" }',
    auditBucket: AUDIT_BUCKET,
    loaded: args.loaded,
    profileId: args.profileId,
    crewId: args.crewId,
    adHocProvider: args.adHocProvider,
    runner: args.runner,
  });
  return { proposed: result.parsed.resolved, rationale: result.parsed.rationale };
}
