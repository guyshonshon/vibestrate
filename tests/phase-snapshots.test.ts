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

    const okExec = await restorePhaseSnapshot(wtB, execSnap!.treeSha);
    expect(okExec).toBe(true);
    expect(await fs.readFile(path.join(wtB, "feature.ts"), "utf8")).toBe("export const v = 1;\n");

    const okFix = await restorePhaseSnapshot(wtB, fixSnap!.treeSha);
    expect(okFix).toBe(true);
    expect(await fs.readFile(path.join(wtB, "feature.ts"), "utf8")).toBe("export const v = 2;\n");
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
