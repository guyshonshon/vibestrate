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
// `restoreWorktree(targetWorktree, treeSha)` — runs share the project's object
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

/** Pipeline rank — lets us pick "the latest code ≤ the resume stage". */
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
 * snapshot (an empty tree relative to base is still captured — callers decide).
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

/** Materialize a snapshot tree into a (resumed) run's worktree. */
export async function restorePhaseSnapshot(
  worktree: string,
  treeSha: string,
): Promise<boolean> {
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
