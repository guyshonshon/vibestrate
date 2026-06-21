// ── Interactive git-tree merge service (predict / apply / undo) ──────────────
//
// The write side of the interactive git tree. Any-node-to-any-node merges that
// are HUMAN-INITIATED, predicted in a throwaway worktree first, applied only on
// explicit confirmation through the Action Broker, and one-click reversible.
//
// Safety model (mirrors integration-service.ts, which is the reviewed template):
//   - predict runs in a scratch worktree off the target ref and NEVER commits or
//     touches a real branch; the scratch is always torn down.
//   - apply is GATED by the Action Broker (`git.merge`, fail-closed), refuses
//     unless the target is the checked-out branch (never moves HEAD), refuses a
//     dirty tree, and records the target's pre-merge sha to disk BEFORE merging
//     so a crash mid-apply is still reversible ("recorded + reversible", not
//     atomic - design correction #1).
//   - undo is a guarded `reset --hard` to the recorded pre-merge sha; it refuses
//     when anything was built on top, when the pre-merge point is already on the
//     upstream (best-effort push detection), on drift, or when uncommitted work
//     would be discarded (design correction #2).
//
// merges-only (`--no-ff`), local only, never pushes, never auto-merges.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs, constants as fsConstants } from "node:fs";
import { execa } from "execa";
import { loadConfig, type LoadedConfig } from "../project/config-loader.js";
import { resolveWorktreePath } from "../utils/paths.js";
import { creditTrailers } from "./commit-credit.js";
import { isSecretLikePath } from "../core/diff-service.js";
import { hasConflictMarkers, isLikelyBinary } from "./conflict-parser.js";
import {
  createWorktree,
  removeWorktree,
  deleteBranch,
  mergeNoCommit,
  abortMerge,
  commitMerge,
  refExists,
  hasChanges,
  currentHeadSha,
  getCurrentBranch,
  reset,
  mergeInProgress,
  commitParents,
  isAncestor,
  revParse,
  upstreamRef,
  treeOf,
  cleanMergeTree,
} from "./git.js";
import {
  createActionBroker,
  type ActionBroker,
  type ActionRequest,
  type ActionDecision,
} from "../safety/action-broker.js";

export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeError";
  }
}

/** Same shape integration-service uses; rejects refspecs, options, traversal. */
const SAFE_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/;

/** Synthetic run-id the broker audit log is keyed under (correction #8). */
const AUDIT_RUN = "git-tree";

export type MergePrediction = {
  source: string;
  target: string;
  /** Tip shas at predict time, for the UI overlay. Apply intentionally does NOT
   *  compare these - it re-resolves the refs fresh under its own guards, so a
   *  stale prediction can never drive a merge of the wrong commits (TOCTOU). */
  sourceSha: string;
  targetSha: string;
  clean: boolean;
  /** Clean AND nothing to merge (source already contained in target). */
  alreadyUpToDate: boolean;
  /** Whole conflicted files (with `<<<<<<<` markers), NOT hunks (correction #4). */
  conflictedFiles: string[];
  note: string;
};

export type ApplyResult = {
  source: string;
  target: string;
  preSha: string;
  /** New target tip. Equals `preSha` when `alreadyUpToDate`. */
  mergedSha: string;
  alreadyUpToDate: boolean;
};

export type UndoResult =
  | { undone: true; target: string; preSha: string; from: string }
  | { undone: false; reason: string };

/**
 * Persisted reversal record. Written with `preSha` BEFORE the merge runs, then
 * finalized with `mergedSha` after it lands - so a crash between the two leaves
 * enough on disk to undo (the merge commit always has `preSha` as a parent).
 */
export type MergeRecord = {
  target: string;
  source: string;
  preSha: string;
  /** Source tip at apply time. Lets undo positively identify a half-applied
   *  merge (parents == {preSha, sourceSha}) instead of trusting "preSha is a
   *  parent", which any merge off this base would satisfy (adversarial-review). */
  sourceSha: string;
  /** Set once the merge commit lands and is finalized; null while applying. */
  mergedSha: string | null;
  status: "applying" | "applied";
  recordedAt: string;
  mergedAt: string | null;
};

function mergeDir(projectRoot: string): string {
  return path.join(projectRoot, ".vibestrate", "merge");
}

/** Injective branch -> filename map. `%` can't appear in a SAFE_BRANCH_RE name,
 *  so encoding `/` as `%2F` keeps `a/b` and `a-b` in distinct files (a literal
 *  `-` is never produced from a slash). Prevents undoing the wrong branch. */
function mergeRecordPath(projectRoot: string, branch: string): string {
  return path.join(mergeDir(projectRoot), `${branch.replace(/\//g, "%2F")}.json`);
}

async function writeMergeRecord(
  projectRoot: string,
  record: MergeRecord,
): Promise<void> {
  await fs.mkdir(mergeDir(projectRoot), { recursive: true });
  await fs.writeFile(
    mergeRecordPath(projectRoot, record.target),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

export async function readMergeRecord(
  projectRoot: string,
  branch: string,
): Promise<MergeRecord | null> {
  try {
    return JSON.parse(
      await fs.readFile(mergeRecordPath(projectRoot, branch), "utf8"),
    ) as MergeRecord;
  } catch {
    return null;
  }
}

async function deleteMergeRecord(
  projectRoot: string,
  branch: string,
): Promise<void> {
  await fs.rm(mergeRecordPath(projectRoot, branch), { force: true });
}

function assertSafeBranch(name: string, role: string): string {
  const trimmed = name.trim();
  if (!SAFE_BRANCH_RE.test(trimmed)) {
    throw new MergeError(`Invalid ${role} branch name "${name}".`);
  }
  return trimmed;
}

/**
 * Dry-run a merge of `source` into `target` in a scratch worktree off the target
 * ref. Reports clean/conflicted-files without mutating any real branch. The
 * scratch worktree + branch are always removed.
 */
export async function predictMerge(input: {
  projectRoot: string;
  source: string;
  target: string;
}): Promise<MergePrediction> {
  const source = assertSafeBranch(input.source, "source");
  const target = assertSafeBranch(input.target, "target");
  if (source === target) {
    throw new MergeError("Source and target are the same branch.");
  }
  const loaded = await loadConfig(input.projectRoot);
  if (!(await refExists(input.projectRoot, target))) {
    throw new MergeError(`Target branch "${target}" does not exist.`);
  }
  if (!(await refExists(input.projectRoot, source))) {
    throw new MergeError(`Source branch "${source}" does not exist.`);
  }
  const targetSha = (await revParse(input.projectRoot, target)) ?? "";
  const sourceSha = (await revParse(input.projectRoot, source)) ?? "";

  const scratchBranch = `vibe-merge-pred-${randomUUID().slice(0, 8)}`;
  const scratchPath = resolveWorktreePath(
    input.projectRoot,
    loaded.config.git.worktreeDir,
    scratchBranch,
  );
  // Pre-flight prune of any stale scratch dir (uuid suffix makes a live
  // collision near-impossible, but never reuse a dirty scratch).
  await removeWorktree(input.projectRoot, scratchPath);
  await createWorktree({
    cwd: input.projectRoot,
    worktreePath: scratchPath,
    branchName: scratchBranch,
    startPoint: target,
  });
  try {
    const attempt = await mergeNoCommit(scratchPath, source);
    // Clean with no MERGE_HEAD == source already merged into target (nothing to
    // merge); MERGE_HEAD, not `git status`, so untracked files don't mislead.
    const alreadyUpToDate = attempt.clean && !(await mergeInProgress(scratchPath));
    if (!attempt.clean) await abortMerge(scratchPath);
    return {
      source,
      target,
      sourceSha,
      targetSha,
      clean: attempt.clean,
      alreadyUpToDate,
      conflictedFiles: attempt.conflictedFiles,
      note: attempt.clean
        ? alreadyUpToDate
          ? "already up to date"
          : "clean"
        : attempt.conflictedFiles.length
          ? "conflicts"
          : "merge failed",
    };
  } finally {
    await removeWorktree(input.projectRoot, scratchPath);
    await deleteBranch(input.projectRoot, scratchBranch);
  }
}

/**
 * Apply a CLEAN merge of `source` into `target` on the real branch. Resolved-
 * conflict apply is Phase 3; this refuses anything that isn't clean.
 *
 * HUMAN-TRIGGERED ONLY: `humanConfirmed` must be the literal `true` from an
 * interactive surface. Gated by the Action Broker; never moves HEAD; records the
 * pre-merge sha before merging; fail-closed on a dirty tree or a non-checked-out
 * target.
 */
/** Resolved guard context, after every apply precondition has passed and the
 *  reversal record has been written. Shared by clean apply and resolved apply so
 *  the two security-critical write paths cannot drift in their guards. */
type ApplyContext = {
  source: string;
  target: string;
  loaded: LoadedConfig;
  broker: ActionBroker;
  req: ActionRequest;
  decision: ActionDecision;
  preSha: string;
  sourceSha: string;
};

/**
 * Run every apply precondition (human-confirm, name validation, refs exist,
 * target is the checked-out branch, clean tree, broker gate) and write the
 * `applying` reversal record BEFORE any merge. Throws MergeError on any failure
 * (no mutation has happened yet except the record + a recorded broker denial).
 */
async function beginApply(input: {
  projectRoot: string;
  source: string;
  target: string;
  humanConfirmed: true;
  proposedBy?: "ui" | "cli";
}): Promise<ApplyContext> {
  if (input.humanConfirmed !== true) {
    throw new MergeError("apply requires explicit human confirmation.");
  }
  const source = assertSafeBranch(input.source, "source");
  const target = assertSafeBranch(input.target, "target");
  if (source === target) {
    throw new MergeError("Source and target are the same branch.");
  }
  const loaded = await loadConfig(input.projectRoot);
  if (!(await refExists(input.projectRoot, target))) {
    throw new MergeError(`Target branch "${target}" does not exist.`);
  }
  if (!(await refExists(input.projectRoot, source))) {
    throw new MergeError(`Source branch "${source}" does not exist.`);
  }

  // Never relocate the user's HEAD (mirrors the integration apply path): apply
  // runs on the project's checked-out branch and refuses if that isn't the target.
  const head = await getCurrentBranch(input.projectRoot);
  if (head !== target) {
    throw new MergeError(
      `The project is on "${head ?? "(detached)"}", not "${target}". Check out "${target}" first - apply never moves your HEAD.`,
    );
  }

  // Fail-closed on a dirty tree. Tracked-only: untracked files can't be silently
  // lost by a merge (git aborts rather than overwrite one) and are not what a
  // merge clobbers; this also keeps our own untracked `.vibestrate` metadata from
  // making apply self-refusing.
  if (await hasTrackedChanges(input.projectRoot)) {
    throw new MergeError(
      "The project working tree has uncommitted changes - commit or stash them first.",
    );
  }

  // Broker gate: a deny / require_approval refuses here. This surface IS the
  // human ack, so a policy hold means "not even with one".
  const broker = createActionBroker(input.projectRoot, AUDIT_RUN);
  const req: ActionRequest = {
    runId: AUDIT_RUN,
    kind: "git.merge",
    subject: { from: source, into: target },
    proposedBy: input.proposedBy ?? "ui",
  };
  const decision = await broker.decide(req);
  if (decision.effect !== "allow") {
    await broker.record(req, decision, {
      ok: false,
      summary: `merge ${source} -> ${target} refused (${decision.effect})`,
    });
    throw new MergeError(
      `Policy ${decision.effect === "deny" ? "denied" : "requires approval for"} this merge: ${
        "reason" in decision ? decision.reason : "policy"
      }`,
    );
  }

  const preSha = await currentHeadSha(input.projectRoot);
  if (!preSha) {
    throw new MergeError(`Target branch "${target}" has no commits.`);
  }
  const sourceSha = await revParse(input.projectRoot, source);
  if (!sourceSha) {
    throw new MergeError(`Source branch "${source}" did not resolve.`);
  }

  // Record the reversal point BEFORE the merge (correction #1). A crash after
  // this leaves enough on disk to undo: preSha to reset to, and sourceSha to
  // positively identify the half-applied merge commit.
  await writeMergeRecord(input.projectRoot, {
    target,
    source,
    preSha,
    sourceSha,
    mergedSha: null,
    status: "applying",
    recordedAt: new Date().toISOString(),
    mergedAt: null,
  });

  return { source, target, loaded, broker, req, decision, preSha, sourceSha };
}

export async function applyMerge(input: {
  projectRoot: string;
  source: string;
  target: string;
  humanConfirmed: true;
  proposedBy?: "ui" | "cli";
}): Promise<ApplyResult> {
  const { source, target, loaded, broker, req, decision, preSha, sourceSha } =
    await beginApply(input);

  // Any UNEXPECTED throw after the record is written (e.g. git status failing)
  // must not leave a partial staged merge + stale record on the real branch.
  try {
    const attempt = await mergeNoCommit(input.projectRoot, source);
    if (!attempt.clean) {
      // Conflict: leave nothing on the real branch. Abort restores the tree to
      // preSha (HEAD never moved), so there is nothing to undo - drop the record.
      await abortMerge(input.projectRoot);
      await deleteMergeRecord(input.projectRoot, target);
      await broker.record(req, decision, {
        ok: false,
        summary: `merge ${source} -> ${target} conflicted; aborted (${attempt.conflictedFiles.length} file(s))`,
      });
      throw new MergeError(
        `Merge of "${source}" into "${target}" has conflicts (${attempt.conflictedFiles.join(", ") || "merge failed"}). Predict + resolve before applying.`,
      );
    }

    // No MERGE_HEAD after a clean `--no-ff --no-commit` == already up to date
    // (nothing to merge), so no commit + nothing to undo. We check MERGE_HEAD,
    // not `git status`, because an untracked file in the project (e.g. ignored
    // `.vibestrate` runtime) would otherwise look like a stageable change.
    if (!(await mergeInProgress(input.projectRoot))) {
      await deleteMergeRecord(input.projectRoot, target);
      await broker.record(req, decision, {
        ok: true,
        summary: `merge ${source} -> ${target}: already up to date`,
      });
      return { source, target, preSha, mergedSha: preSha, alreadyUpToDate: true };
    }

    const committed = await commitMerge(
      input.projectRoot,
      `merge ${source} into ${target}`,
      creditTrailers(loaded.config.commits),
    );
    if (!committed) {
      await abortMerge(input.projectRoot);
      await deleteMergeRecord(input.projectRoot, target);
      await broker.record(req, decision, {
        ok: false,
        summary: `merge ${source} -> ${target}: commit failed; aborted`,
      });
      throw new MergeError(
        `Merge of "${source}" into "${target}" staged but failed to commit (aborted).`,
      );
    }

    await writeMergeRecord(input.projectRoot, {
      target,
      source,
      preSha,
      sourceSha,
      mergedSha: committed.sha,
      status: "applied",
      recordedAt: new Date().toISOString(),
      mergedAt: new Date().toISOString(),
    });
    await broker.record(req, decision, {
      ok: true,
      summary: `merged ${source} -> ${target} @ ${committed.sha.slice(0, 10)} (local only, not pushed)`,
    });
    return {
      source,
      target,
      preSha,
      mergedSha: committed.sha,
      alreadyUpToDate: false,
    };
  } catch (err) {
    if (!(err instanceof MergeError)) {
      await abortPartialApply(
        input.projectRoot,
        target,
        broker,
        req,
        decision,
        `merge ${source} -> ${target}: unexpected error; aborted`,
      );
    }
    throw err;
  }
}

/** Best-effort cleanup when an UNEXPECTED error escapes a merge execution (a
 *  MergeError has already cleaned up after itself). Aborts any in-progress
 *  merge, drops the applying-record, and audits - so no partial merge or stale
 *  record is left on the real branch. */
async function abortPartialApply(
  projectRoot: string,
  target: string,
  broker: ActionBroker,
  req: ActionRequest,
  decision: ActionDecision,
  summary: string,
): Promise<void> {
  await abortMerge(projectRoot).catch(() => {});
  await deleteMergeRecord(projectRoot, target).catch(() => {});
  await broker.record(req, decision, { ok: false, summary }).catch(() => {});
}

/** A human-accepted resolution for one conflicted file (full file content). */
export type ResolvedFile = { path: string; content: string };

/**
 * Apply a merge whose conflicts the human has resolved (e.g. accepted/edited
 * supervisor proposals). Same gated preamble as {@link applyMerge}; then writes
 * ONLY files git reported as conflicted in this merge (neutralizes path
 * traversal / stray writes), refuses secret-like paths and residual conflict
 * markers, requires every conflict resolved, and commits a real merge.
 * Reversible by {@link undoMerge} exactly like a clean apply.
 */
export async function applyResolvedMerge(input: {
  projectRoot: string;
  source: string;
  target: string;
  resolvedFiles: ResolvedFile[];
  humanConfirmed: true;
  proposedBy?: "ui" | "cli";
}): Promise<ApplyResult> {
  const { source, target, loaded, broker, req, decision, preSha, sourceSha } =
    await beginApply(input);

  const fail = async (summary: string, message: string): Promise<never> => {
    await abortMerge(input.projectRoot);
    await deleteMergeRecord(input.projectRoot, target);
    await broker.record(req, decision, { ok: false, summary });
    throw new MergeError(message);
  };

  // Any UNEXPECTED throw after files are written/staged must not leave a partial
  // merge + stale record on the real branch (a MergeError from fail() already
  // cleaned up). Wrap the whole execution.
  try {
    const attempt = await mergeNoCommit(input.projectRoot, source);
    if (!attempt.clean) {
      const conflicted = new Set(attempt.conflictedFiles);
      for (const rf of input.resolvedFiles) {
        const p = rf.path.trim();
        // Only paths git itself reported as conflicted may be written. This is the
        // traversal/stray-write guard: we never write an arbitrary client path.
        if (!conflicted.has(p)) {
          await fail(
            `resolved apply ${source} -> ${target}: rejected non-conflicted path "${p}"`,
            `Refusing to write "${p}": not one of this merge's conflicted files.`,
          );
        }
        if (isSecretLikePath(p)) {
          await fail(
            `resolved apply ${source} -> ${target}: rejected secret-like path "${p}"`,
            `Refusing to write a resolution to secret-like path "${p}" - resolve it manually.`,
          );
        }
        if (hasConflictMarkers(rf.content)) {
          await fail(
            `resolved apply ${source} -> ${target}: residual markers in "${p}"`,
            `The resolution for "${p}" still contains conflict markers.`,
          );
        }
        if (isLikelyBinary(rf.content)) {
          await fail(
            `resolved apply ${source} -> ${target}: binary content for "${p}"`,
            `Refusing a binary resolution for "${p}" - resolve it manually.`,
          );
        }
        // Symlink-safe write (adversarial-review BLOCKER): `conflicted.has(p)`
        // only validates the path STRING, but git can leave a conflict as a
        // symlink - a naive writeFile would follow it outside the repo or into
        // `.git/hooks` (RCE). Refuse a symlinked leaf, a parent that resolves
        // outside the project root or into `.git`, and use O_NOFOLLOW so a
        // TOCTOU re-link between check and write can't escape either.
        const abs = path.join(input.projectRoot, p);
        const lst = await fs.lstat(abs).catch(() => null);
        if (lst?.isSymbolicLink()) {
          await fail(
            `resolved apply ${source} -> ${target}: symlink path "${p}"`,
            `Refusing to write to "${p}": it is a symlink - resolve symlink conflicts manually.`,
          );
        }
        const realRoot = await fs.realpath(input.projectRoot);
        const realParent = await fs.realpath(path.dirname(abs)).catch(() => null);
        const insideRoot =
          realParent === realRoot || (realParent?.startsWith(realRoot + path.sep) ?? false);
        const gitDir = path.join(realRoot, ".git");
        const underGit =
          realParent === gitDir || (realParent?.startsWith(gitDir + path.sep) ?? false);
        if (!realParent || !insideRoot || underGit) {
          await fail(
            `resolved apply ${source} -> ${target}: path "${p}" resolves outside the worktree`,
            `Refusing to write "${p}": it resolves outside the project worktree (or into .git).`,
          );
        }
        try {
          const fh = await fs.open(
            abs,
            fsConstants.O_WRONLY |
              fsConstants.O_CREAT |
              fsConstants.O_TRUNC |
              fsConstants.O_NOFOLLOW,
          );
          try {
            await fh.writeFile(rf.content, "utf8");
          } finally {
            await fh.close();
          }
        } catch {
          await fail(
            `resolved apply ${source} -> ${target}: write refused for "${p}"`,
            `Refusing to write "${p}": the path could not be opened safely (symlink?).`,
          );
        }
        const add = await execa("git", ["add", "--", p], {
          cwd: input.projectRoot,
          reject: false,
        });
        if (add.exitCode !== 0) {
          await fail(
            `resolved apply ${source} -> ${target}: git add failed for "${p}"`,
            `Failed to stage the resolution for "${p}".`,
          );
        }
      }
      // Every conflict must be resolved - no unmerged paths may remain.
      const unmerged = await execa(
        "git",
        ["diff", "--name-only", "--diff-filter=U"],
        { cwd: input.projectRoot, reject: false },
      );
      const remaining = unmerged.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (remaining.length > 0) {
        await fail(
          `resolved apply ${source} -> ${target}: ${remaining.length} unresolved file(s)`,
          `Not all conflicts were resolved (still unmerged: ${remaining.join(", ")}).`,
        );
      }
    } else if (!(await mergeInProgress(input.projectRoot))) {
      // Clean + no MERGE_HEAD == already up to date (see applyMerge note).
      await deleteMergeRecord(input.projectRoot, target);
      await broker.record(req, decision, {
        ok: true,
        summary: `merge ${source} -> ${target}: already up to date`,
      });
      return { source, target, preSha, mergedSha: preSha, alreadyUpToDate: true };
    }

    const committed = await commitMerge(
      input.projectRoot,
      `merge ${source} into ${target} (resolved)`,
      creditTrailers(loaded.config.commits),
    );
    if (!committed) {
      await abortMerge(input.projectRoot);
      await deleteMergeRecord(input.projectRoot, target);
      await broker.record(req, decision, {
        ok: false,
        summary: `resolved apply ${source} -> ${target}: commit failed; aborted`,
      });
      throw new MergeError(
        `Merge of "${source}" into "${target}" failed to commit (aborted).`,
      );
    }

    await writeMergeRecord(input.projectRoot, {
      target,
      source,
      preSha,
      sourceSha,
      mergedSha: committed.sha,
      status: "applied",
      recordedAt: new Date().toISOString(),
      mergedAt: new Date().toISOString(),
    });
    await broker.record(req, decision, {
      ok: true,
      summary: `merged (resolved) ${source} -> ${target} @ ${committed.sha.slice(0, 10)} (local only)`,
    });
    return {
      source,
      target,
      preSha,
      mergedSha: committed.sha,
      alreadyUpToDate: false,
    };
  } catch (err) {
    if (!(err instanceof MergeError)) {
      await abortPartialApply(
        input.projectRoot,
        target,
        broker,
        req,
        decision,
        `resolved apply ${source} -> ${target}: unexpected error; aborted`,
      );
    }
    throw err;
  }
}

/**
 * Reverse an applied merge by resetting `target` to its recorded pre-merge sha.
 * Guarded (correction #2): refuses on tip-advance, on a published pre-merge
 * point (best-effort), on drift / missing record, and when uncommitted work
 * would be discarded. Returns a typed verdict; never throws a partial state.
 */
export async function undoMerge(input: {
  projectRoot: string;
  target: string;
  proposedBy?: "ui" | "cli";
}): Promise<UndoResult> {
  const target = assertSafeBranch(input.target, "target");
  const record = await readMergeRecord(input.projectRoot, target);
  if (!record) {
    return {
      undone: false,
      reason: `No merge record for "${target}" - nothing to undo.`,
    };
  }

  // Drift / gc: the pre-merge sha must still resolve to a real COMMIT object.
  // The `^{commit}` peel rejects a gc'd/garbage sha that bare `rev-parse
  // --verify` would wave through (e.g. the all-zeros null sha) - so a drifted
  // record returns a typed refusal here instead of throwing later at reset.
  if (!(await revParse(input.projectRoot, `${record.preSha}^{commit}`))) {
    return {
      undone: false,
      reason: `The pre-merge commit ${record.preSha.slice(0, 10)} no longer exists (history drifted) - refusing to undo.`,
    };
  }
  if (!(await refExists(input.projectRoot, target))) {
    return { undone: false, reason: `Branch "${target}" no longer exists.` };
  }
  // Defense-in-depth: the record must be FOR this branch. Guards against a
  // record-file aliasing bug ever resetting the wrong branch (adversarial-review).
  if (record.target !== target) {
    return {
      undone: false,
      reason: `Merge record mismatch (recorded for "${record.target}", asked to undo "${target}") - refusing.`,
    };
  }

  // Only the checked-out branch can be reset; never move HEAD.
  const head = await getCurrentBranch(input.projectRoot);
  if (head !== target) {
    return {
      undone: false,
      reason: `The project is on "${head ?? "(detached)"}", not "${target}". Check out "${target}" to undo.`,
    };
  }

  const cur = await currentHeadSha(input.projectRoot);
  if (!cur) {
    return { undone: false, reason: `Branch "${target}" has no commits.` };
  }

  // Guard (a) - identity / tip-advance. Positively identify the commit we'd be
  // discarding before any reset; "preSha is a parent" alone is NOT enough -
  // every merge off this base satisfies it (adversarial-review BLOCKER).
  if (record.mergedSha) {
    // Normal apply: the tip must be exactly the recorded merge.
    if (cur !== record.mergedSha) {
      return {
        undone: false,
        reason: `"${target}" advanced past the recorded merge (now ${cur.slice(0, 10)}, expected ${record.mergedSha.slice(0, 10)}) - something was built on top. Refusing.`,
      };
    }
  } else if (cur !== record.preSha) {
    // Crashed before finalizing mergedSha. Accept ONLY a 2-parent merge whose
    // parents are exactly {preSha, sourceSha} - the half-applied merge. Any
    // other tip (incl. an unrelated merge that merely has preSha as a parent)
    // is refused, so undo never reset --hard over real work.
    if (!record.sourceSha) {
      return {
        undone: false,
        reason: `Cannot confirm the current tip of "${target}" is the recorded merge (no source recorded) - refusing.`,
      };
    }
    const parents = await commitParents(input.projectRoot, cur);
    const expected = new Set([record.preSha, record.sourceSha]);
    const parentsMatch =
      parents.length === 2 &&
      new Set(parents).size === 2 &&
      parents.every((p) => expected.has(p));
    if (!parentsMatch) {
      return {
        undone: false,
        reason: `Cannot confirm the current tip of "${target}" is the recorded merge of "${record.source}" - refusing.`,
      };
    }
    // Identity, not just parentage (adversarial-review): a parent set is shared
    // by every merge of this source into this base. The tip's tree must be
    // EXACTLY the clean merge of preSha+sourceSha, so an amended/edited merge
    // (extra work folded in) or a differently-resolved redo can't be reset away.
    // Fail closed if the clean-merge tree can't be computed.
    const expectedTree = await cleanMergeTree(
      input.projectRoot,
      record.preSha,
      record.sourceSha,
    );
    const actualTree = await treeOf(input.projectRoot, cur);
    if (!expectedTree || !actualTree || expectedTree !== actualTree) {
      return {
        undone: false,
        reason: `Cannot confirm the current tip of "${target}" is the pristine recorded merge (tree differs) - refusing.`,
      };
    }
  }
  // (cur === preSha here means the merge never committed: reset is a no-op that
  // also clears any crashed mid-merge state - safe to proceed.)

  // Guard (b) - published: refuse if the MERGE COMMIT itself (the current tip,
  // when the branch advanced) is already on the upstream - i.e. it may be
  // pushed. Checking the merge commit, not preSha, is what makes a normal
  // local-only merge (origin still at preSha) undoable (adversarial-review HIGH).
  if (cur !== record.preSha) {
    const upstream = await upstreamRef(input.projectRoot, target);
    if (upstream && (await isAncestor(input.projectRoot, cur, upstream))) {
      return {
        undone: false,
        reason: `"${target}" tracks "${upstream}" and the merge ${cur.slice(0, 10)} is already upstream - it may be pushed. Undo refused (push detection is best-effort).`,
      };
    }
  }

  // Guard - clobber: a `reset --hard` discards uncommitted changes to TRACKED
  // files (untracked files, incl. our own `.vibestrate` metadata, survive it).
  // Allow the crashed mid-apply case (MERGE_HEAD present), which reset clears.
  if (
    (await hasTrackedChanges(input.projectRoot)) &&
    !(await mergeInProgress(input.projectRoot))
  ) {
    return {
      undone: false,
      reason: `"${target}" has uncommitted changes - commit or stash them before undo (reset --hard would discard them).`,
    };
  }

  await reset(input.projectRoot, record.preSha, { hard: true });
  await deleteMergeRecord(input.projectRoot, target);

  // Audit the undo (record only, not gated: undo is the recovery action and
  // must stay available even when a policy now denies forward merges).
  const broker = createActionBroker(input.projectRoot, AUDIT_RUN);
  const undoDecision: ActionDecision = { effect: "allow", ruleIds: ["git.undo"] };
  const req: ActionRequest = {
    runId: AUDIT_RUN,
    kind: "git.merge",
    subject: { action: "undo", branch: target, from: cur, to: record.preSha },
    proposedBy: input.proposedBy ?? "ui",
  };
  await broker.record(req, undoDecision, {
    ok: true,
    summary: `undo merge on ${target}: ${cur.slice(0, 10)} -> ${record.preSha.slice(0, 10)} (reset --hard, local only)`,
  });

  return { undone: true, target, preSha: record.preSha, from: cur };
}

/**
 * True when there are uncommitted changes to TRACKED files (staged or unstaged).
 * Untracked files are deliberately excluded: a merge can't silently lose them
 * (git aborts rather than overwrite an untracked path) and `reset --hard` leaves
 * them in place, so they are never the dirty-tree risk this guards - and it keeps
 * this feature's own untracked `.vibestrate` metadata from blocking the gate.
 */
async function hasTrackedChanges(projectRoot: string): Promise<boolean> {
  const r = await execa(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: projectRoot, reject: false },
  );
  if (r.exitCode !== 0) {
    // Fall back to the strict check rather than assuming clean.
    return hasChanges(projectRoot);
  }
  return r.stdout.trim().length > 0;
}
