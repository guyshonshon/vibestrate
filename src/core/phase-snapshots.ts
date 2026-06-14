// ── Per-phase worktree snapshots (Rewind phase 2) ───────────────────────────
//
// Capture the run's worktree code state at each code-producing phase boundary
// (after executing, after each fixing) as a DURABLE git object, so a later run
// can "rewind to review/verify/fix" and have the same files to work on.
//
// Mechanism (see docs/design/rewind-phase-2.md):
//   tree   = git add -A + git write-tree            (snapshotWorktree)
//   commit = git commit-tree <tree>                 (parentless; explicit author)
//   ref    = git update-ref refs/vibestrate/snapshots/<runId>/<seq>  <commit>
// The ref keeps the tree + blobs reachable across `git gc`. Restoring is just
// `restoreWorktree(targetWorktree, treeSha)` - runs share the project's object
// DB, so a tree captured in one run materializes cleanly in another's worktree.

import { execa } from "execa";
import { z } from "zod";
import path from "node:path";
import { snapshotWorktree, restoreWorktree } from "../safety/diff-gate.js";
import { runDir } from "../utils/paths.js";
import { pathExists, readText, writeText, ensureDir } from "../utils/fs.js";
import { nowIso } from "../utils/time.js";

/** Stages whose output we snapshot (the ones that change code). */
export type SnapshotStage = "executing" | "fixing";

/** Downstream stages a run can be rewound to (the ones that need restored code). */
export type DownstreamResumeStage = "reviewing" | "fixing" | "verifying";

export const phaseSnapshotSchema = z.object({
  /** 0-based capture order within the run. */
  seq: z.number().int().min(0),
  stage: z.string(),
  treeSha: z.string().min(1),
  commitSha: z.string().min(1),
  ref: z.string().min(1),
  at: z.string(),
});
export type PhaseSnapshot = z.infer<typeof phaseSnapshotSchema>;

export const phaseSnapshotsFileSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(phaseSnapshotSchema).default([]),
});

function manifestPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "phase-snapshots.json");
}

/** Pipeline rank - lets us pick "the latest code ≤ the resume stage". */
const STAGE_RANK: Record<string, number> = {
  executing: 0,
  reviewing: 1,
  fixing: 2,
  verifying: 3,
};

async function git(
  cwd: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string }> {
  const r = await execa("git", args, { cwd, reject: false });
  return { ok: r.exitCode === 0, stdout: (r.stdout ?? "").trim() };
}

/** Read a run's snapshot manifest (empty when absent / malformed). */
export async function readPhaseSnapshots(
  projectRoot: string,
  runId: string,
): Promise<PhaseSnapshot[]> {
  const file = manifestPath(projectRoot, runId);
  if (!(await pathExists(file))) return [];
  try {
    const parsed = phaseSnapshotsFileSchema.safeParse(JSON.parse(await readText(file)));
    return parsed.success ? parsed.data.snapshots : [];
  } catch {
    return [];
  }
}

async function writePhaseSnapshots(
  projectRoot: string,
  runId: string,
  snapshots: PhaseSnapshot[],
): Promise<void> {
  await ensureDir(runDir(projectRoot, runId));
  await writeText(
    manifestPath(projectRoot, runId),
    `${JSON.stringify(phaseSnapshotsFileSchema.parse({ version: 1, snapshots }), null, 2)}\n`,
  );
}

/**
 * Capture the worktree as a durable, ref-anchored snapshot and append it to the
 * run's manifest. Best-effort: returns null on any git failure so a snapshot
 * problem never fails the run. Returns null too when there are no changes to
 * snapshot (an empty tree relative to base is still captured - callers decide).
 */
export async function capturePhaseSnapshot(input: {
  projectRoot: string;
  runId: string;
  worktree: string;
  stage: SnapshotStage;
}): Promise<PhaseSnapshot | null> {
  const { projectRoot, runId, worktree, stage } = input;
  try {
    const treeSha = await snapshotWorktree(worktree);
    const message = `vibestrate snapshot: run ${runId} stage ${stage}`;
    const commit = await git(worktree, ["commit-tree", treeSha, "-m", message]);
    if (!commit.ok || !commit.stdout) return null;
    const commitSha = commit.stdout;

    const existing = await readPhaseSnapshots(projectRoot, runId);
    const seq = existing.length;
    const ref = `refs/vibestrate/snapshots/${runId}/${seq}-${stage}`;
    const updated = await git(worktree, ["update-ref", ref, commitSha]);
    if (!updated.ok) return null;

    const record: PhaseSnapshot = {
      seq,
      stage,
      treeSha,
      commitSha,
      ref,
      at: nowIso(),
    };
    await writePhaseSnapshots(projectRoot, runId, [...existing, record]);
    return record;
  } catch {
    return null;
  }
}

/**
 * The snapshot to restore when resuming at `resumeStage`: the most recent
 * captured snapshot whose stage strictly precedes the resume stage in the
 * pipeline. (review → the executing snapshot; verify → the last fixing snapshot;
 * fix → the executing snapshot.) Null when the source run has no usable snapshot.
 */
export function pickSnapshotForResume(
  snapshots: PhaseSnapshot[],
  resumeStage: DownstreamResumeStage,
): PhaseSnapshot | null {
  const resumeRank = STAGE_RANK[resumeStage] ?? 0;
  const eligible = snapshots.filter(
    (s) => (STAGE_RANK[s.stage] ?? 0) < resumeRank,
  );
  if (eligible.length === 0) return null;
  // Latest by capture order.
  return eligible.reduce((a, b) => (b.seq > a.seq ? b : a));
}

/**
 * True when `worktree` is a safe destructive-restore target: a real path that is
 * NOT the project root itself. Restore runs `checkout-index -f` + `clean -fd`, so
 * it must only ever touch a dedicated, throwaway run worktree - never the user's
 * checked-out project. `resolveWorktreePath` already guarantees a per-run subdir;
 * this is defense in depth at the destructive boundary.
 */
export function isSafeRestoreTarget(worktree: string, projectRoot: string): boolean {
  const wt = path.resolve(worktree);
  const root = path.resolve(projectRoot);
  return wt !== root;
}

/**
 * Materialize a snapshot tree into a (resumed) run's worktree. Refuses (returns
 * false) when the target would be the project root - a destructive restore must
 * never run against the user's checkout.
 */
export async function restorePhaseSnapshot(
  worktree: string,
  treeSha: string,
  projectRoot: string,
): Promise<boolean> {
  if (!isSafeRestoreTarget(worktree, projectRoot)) return false;
  return restoreWorktree(worktree, treeSha);
}

/** Best-effort cleanup of a run's snapshot refs (e.g. when pruning a run). */
export async function deletePhaseSnapshotRefs(
  worktreeOrRepo: string,
  runId: string,
): Promise<void> {
  const list = await git(worktreeOrRepo, [
    "for-each-ref",
    "--format=%(refname)",
    `refs/vibestrate/snapshots/${runId}`,
  ]);
  if (!list.ok || !list.stdout) return;
  for (const ref of list.stdout.split("\n").map((l) => l.trim()).filter(Boolean)) {
    await git(worktreeOrRepo, ["update-ref", "-d", ref]);
  }
}

const SNAPSHOT_REF_PREFIX = "refs/vibestrate/snapshots/";

/**
 * Count how many distinct runs have rewind-snapshot refs, and the total ref
 * count - the signal for the consult "housekeeping" tip about `.git` growth.
 * Read-only. THROWS on a real git failure (fail loud); the legitimate
 * no-snapshots case (git ok, no matching refs) returns {runs:0,refs:0}.
 */
export async function countSnapshotRuns(
  repo: string,
): Promise<{ runs: number; refs: number }> {
  const list = await git(repo, [
    "for-each-ref",
    "--format=%(refname)",
    "refs/vibestrate/snapshots",
  ]);
  if (!list.ok) {
    throw new Error(`git for-each-ref failed reading snapshot refs: ${list.stdout || "(no output)"}`);
  }
  const lines = list.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const runIds = new Set<string>();
  for (const refName of lines) {
    if (!refName.startsWith(SNAPSHOT_REF_PREFIX)) continue;
    const rest = refName.slice(SNAPSHOT_REF_PREFIX.length);
    const lastSlash = rest.lastIndexOf("/");
    if (lastSlash <= 0) continue;
    runIds.add(rest.slice(0, lastSlash));
  }
  return { runs: runIds.size, refs: lines.length };
}

/**
 * Given every snapshot ref (`refs/vibestrate/snapshots/<runId>/<seq>-<stage>`)
 * with its committer date, pick the run ids to PRUNE: all but the `keepRuns`
 * most-recent runs. A run's recency is the newest committer date across its
 * snapshot refs, so a run touched recently is never pruned. Pure +
 * table-testable. `keepRuns <= 0` prunes nothing (a safety opt-out, not "prune
 * all"). Ref names that don't match the layout are ignored.
 */
export function selectStaleSnapshotRuns(
  refs: { refName: string; committedAt: number }[],
  keepRuns: number,
): string[] {
  if (keepRuns <= 0) return [];
  const recency = new Map<string, number>();
  for (const { refName, committedAt } of refs) {
    if (!refName.startsWith(SNAPSHOT_REF_PREFIX)) continue;
    const rest = refName.slice(SNAPSHOT_REF_PREFIX.length);
    const lastSlash = rest.lastIndexOf("/");
    if (lastSlash <= 0) continue; // need both <runId> and a final <seq>-<stage>
    const runId = rest.slice(0, lastSlash);
    const prev = recency.get(runId);
    if (prev === undefined || committedAt > prev) recency.set(runId, committedAt);
  }
  return [...recency.entries()]
    .sort((a, b) => b[1] - a[1]) // newest first
    .slice(keepRuns) // keep the head; prune the tail
    .map(([runId]) => runId);
}

/**
 * Prune rewind-snapshot refs so `.git` can't grow without bound (ISSUE-001 #1):
 * keep the `keepRuns` most-recent runs' snapshots, delete the rest. Only refs
 * are removed (the runs' branches/worktrees/artifacts are untouched, and git's
 * reflog keeps the objects through its gc grace), and recent runs stay fully
 * resumable. THROWS on a real git failure (fail loud); the no-snapshots case
 * returns []. `keepRuns <= 0` disables pruning. Returns the run ids pruned.
 */
export async function pruneOldSnapshots(
  repo: string,
  keepRuns: number,
): Promise<string[]> {
  if (keepRuns <= 0) return [];
  const list = await git(repo, [
    "for-each-ref",
    "--format=%(refname) %(committerdate:unix)",
    "refs/vibestrate/snapshots",
  ]);
  if (!list.ok) {
    throw new Error(`git for-each-ref failed reading snapshot refs: ${list.stdout || "(no output)"}`);
  }
  const refs = list.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const sp = line.lastIndexOf(" ");
      return {
        refName: sp > 0 ? line.slice(0, sp) : line,
        committedAt: sp > 0 ? Number(line.slice(sp + 1)) || 0 : 0,
      };
    });
  const stale = selectStaleSnapshotRuns(refs, keepRuns);
  for (const runId of stale) {
    await deletePhaseSnapshotRefs(repo, runId);
  }
  return stale;
}
