import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  capturePhaseSnapshot,
  readPhaseSnapshots,
  pickSnapshotForResume,
  restorePhaseSnapshot,
  isSafeRestoreTarget,
  selectStaleSnapshotRuns,
  pruneOldSnapshots,
  countSnapshotRuns,
} from "../src/core/phase-snapshots.js";

async function git(cwd: string, args: string[]) {
  await execa("git", args, { cwd });
}

/** A temp git repo with one base commit + the .vibestrate runs dir. */
async function mkRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-snap-"));
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.email", "t@t"]);
  await git(root, ["config", "user.name", "t"]);
  await fs.writeFile(path.join(root, "base.txt"), "base\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "base"]);
  return root;
}

/** Add a worktree off the base branch (shares the repo's object DB). */
async function addWorktree(root: string, name: string): Promise<string> {
  const wt = path.join(root, ".worktrees", name);
  await git(root, ["worktree", "add", "-q", "-b", name, wt, "HEAD"]);
  return wt;
}

describe("phase-snapshots", () => {
  it("captures durable snapshots and restores them into another worktree", async () => {
    const root = await mkRepo();
    const runId = "run-a";

    // Run A's worktree produces code, captured at two phases.
    const wtA = await addWorktree(root, "run-a");
    await fs.writeFile(path.join(wtA, "feature.ts"), "export const v = 1;\n");
    const execSnap = await capturePhaseSnapshot({
      projectRoot: root,
      runId,
      worktree: wtA,
      stage: "executing",
    });
    expect(execSnap).not.toBeNull();

    await fs.writeFile(path.join(wtA, "feature.ts"), "export const v = 2;\n");
    const fixSnap = await capturePhaseSnapshot({
      projectRoot: root,
      runId,
      worktree: wtA,
      stage: "fixing",
    });
    expect(fixSnap).not.toBeNull();

    const manifest = await readPhaseSnapshots(root, runId);
    expect(manifest.map((s) => s.stage)).toEqual(["executing", "fixing"]);
    expect(manifest[0]!.seq).toBe(0);

    // The refs keep the snapshots reachable.
    const refs = await execa(
      "git",
      ["for-each-ref", "--format=%(refname)", `refs/vibestrate/snapshots/${runId}`],
      { cwd: root },
    );
    expect(refs.stdout.split("\n").filter(Boolean).length).toBe(2);

    // Run B: a FRESH worktree with none of A's files. Restoring A's snapshot
    // materializes the exact code (proves the shared object DB cross-run path).
    const wtB = await addWorktree(root, "run-b");
    const beforeRestore = await fs
      .readFile(path.join(wtB, "feature.ts"), "utf8")
      .catch(() => null);
    expect(beforeRestore).toBeNull(); // fresh worktree has none of A's files

    const okExec = await restorePhaseSnapshot(wtB, execSnap!.treeSha, root);
    expect(okExec).toBe(true);
    expect(await fs.readFile(path.join(wtB, "feature.ts"), "utf8")).toBe("export const v = 1;\n");

    const okFix = await restorePhaseSnapshot(wtB, fixSnap!.treeSha, root);
    expect(okFix).toBe(true);
    expect(await fs.readFile(path.join(wtB, "feature.ts"), "utf8")).toBe("export const v = 2;\n");
  });

  it("refuses a destructive restore onto the project root (safety guard)", async () => {
    const root = await mkRepo();
    expect(isSafeRestoreTarget(root, root)).toBe(false);
    expect(isSafeRestoreTarget(path.join(root, ".worktrees", "x"), root)).toBe(true);
    // restorePhaseSnapshot refuses (returns false) without touching the root.
    const refused = await restorePhaseSnapshot(root, "deadbeef", root);
    expect(refused).toBe(false);
    // base.txt is untouched.
    expect(await fs.readFile(path.join(root, "base.txt"), "utf8")).toBe("base\n");
  });

  it("pickSnapshotForResume restores the right code per stage", async () => {
    const snaps = [
      { seq: 0, stage: "executing", treeSha: "t0", commitSha: "c0", ref: "r0", at: "1" },
      { seq: 1, stage: "fixing", treeSha: "t1", commitSha: "c1", ref: "r1", at: "2" },
    ];
    // review → the executing snapshot (the raw execute output).
    expect(pickSnapshotForResume(snaps, "reviewing")?.stage).toBe("executing");
    // fix → the executing snapshot (the code the fixer works on).
    expect(pickSnapshotForResume(snaps, "fixing")?.stage).toBe("executing");
    // verify → the latest code (the last fix).
    expect(pickSnapshotForResume(snaps, "verifying")?.stage).toBe("fixing");
    // no snapshots ⇒ null.
    expect(pickSnapshotForResume([], "reviewing")).toBeNull();
  });
});

describe("selectStaleSnapshotRuns (pure retention selector)", () => {
  const ref = (runId: string, seq: number, committedAt: number) => ({
    refName: `refs/vibestrate/snapshots/${runId}/${seq}-executing`,
    committedAt,
  });

  it("keeps the N most-recent runs, prunes the tail (recency = newest ref per run)", () => {
    const refs = [
      ref("old", 0, 100),
      ref("mid", 0, 200),
      ref("new", 0, 150),
      ref("new", 1, 300), // 'new' is most recent via its 2nd snapshot
    ];
    // keep 2 -> keep new(300) + mid(200), prune old(100).
    expect(selectStaleSnapshotRuns(refs, 2)).toEqual(["old"]);
    // keep 1 -> keep new only.
    expect(new Set(selectStaleSnapshotRuns(refs, 1))).toEqual(new Set(["mid", "old"]));
  });

  it("keepRuns <= 0 prunes NOTHING (opt-out, never 'prune all')", () => {
    const refs = [ref("a", 0, 1), ref("b", 0, 2)];
    expect(selectStaleSnapshotRuns(refs, 0)).toEqual([]);
    expect(selectStaleSnapshotRuns(refs, -5)).toEqual([]);
  });

  it("fewer runs than the window -> nothing pruned; malformed refs ignored", () => {
    expect(selectStaleSnapshotRuns([ref("a", 0, 1)], 50)).toEqual([]);
    expect(
      selectStaleSnapshotRuns([{ refName: "refs/heads/main", committedAt: 9 }], 1),
    ).toEqual([]);
  });
});

describe("countSnapshotRuns (fail loud, not best-effort)", () => {
  it("returns 0 for a valid repo with no snapshots (legit empty, no throw)", async () => {
    const root = await mkRepo();
    try {
      expect(await countSnapshotRuns(root)).toEqual({ runs: 0, refs: 0 });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("THROWS on a real git failure (not a git repo) instead of swallowing to 0", async () => {
    const nonGit = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-nogit-"));
    try {
      await expect(countSnapshotRuns(nonGit)).rejects.toThrow();
    } finally {
      await fs.rm(nonGit, { recursive: true, force: true });
    }
  });
});

describe("pruneOldSnapshots (opt-in; deletes only the stale runs' refs)", () => {
  /** Create a snapshot ref for `runId` with an explicit committer date. */
  async function snapAt(root: string, wt: string, runId: string, date: string) {
    await git(wt, ["add", "-A"]);
    const tree = (await execa("git", ["write-tree"], { cwd: wt })).stdout.trim();
    const env = { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date };
    const commit = (
      await execa("git", ["commit-tree", tree, "-m", "snap"], { cwd: wt, env })
    ).stdout.trim();
    await git(wt, ["update-ref", `refs/vibestrate/snapshots/${runId}/0-executing`, commit]);
  }
  const refsFor = async (root: string, runId: string) =>
    (
      await execa(
        "git",
        ["for-each-ref", "--format=%(refname)", `refs/vibestrate/snapshots/${runId}`],
        { cwd: root },
      )
    ).stdout
      .split("\n")
      .filter(Boolean);

  it("prunes the oldest run beyond the window, keeps recent ones; opt-out keeps all", async () => {
    const root = await mkRepo();
    const wt = await addWorktree(root, "w");
    await fs.writeFile(path.join(wt, "f.txt"), "x\n");
    await snapAt(root, wt, "run-old", "2020-01-01T00:00:00");
    await snapAt(root, wt, "run-new", "2026-01-01T00:00:00");

    // Opt-out: keepRuns 0 deletes nothing.
    expect(await pruneOldSnapshots(root, 0)).toEqual([]);
    expect(await refsFor(root, "run-old")).toHaveLength(1);

    // keep 1 -> prune the older run only; the recent run stays resumable.
    const pruned = await pruneOldSnapshots(root, 1);
    expect(pruned).toEqual(["run-old"]);
    expect(await refsFor(root, "run-old")).toHaveLength(0);
    expect(await refsFor(root, "run-new")).toHaveLength(1);
  });
});
