import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  snapshotWorktree,
  captureWorktreePatch,
  restoreWorktree,
  evaluateTurnDiff,
} from "../../src/safety/diff-gate.js";
import {
  DefaultActionBroker,
  type ActionEvaluator,
} from "../../src/safety/action-broker.js";

async function tempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-dg-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(path.join(dir, "src/a.ts"), "export const a = 1\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

describe("snapshot / restore round-trip", () => {
  it("restores modified, added, and deleted files to the snapshot exactly", async () => {
    const wt = await tempRepo();
    try {
      const snap = await snapshotWorktree(wt);

      // Mutate the worktree: modify a tracked file, add a new file, delete one.
      await fs.writeFile(path.join(wt, "src/a.ts"), "export const a = 999\n");
      await fs.writeFile(path.join(wt, "src/new.ts"), "export const n = 2\n");
      await fs.mkdir(path.join(wt, "nested"), { recursive: true });
      await fs.writeFile(path.join(wt, "nested/deep.ts"), "deep\n");

      const { patch, files } = await captureWorktreePatch(wt, snap);
      expect(patch).toContain("src/a.ts");
      expect(files).toContain("src/new.ts");
      expect(files).toContain("nested/deep.ts");

      await restoreWorktree(wt, snap);

      // a.ts back to original; new files gone.
      expect(await fs.readFile(path.join(wt, "src/a.ts"), "utf8")).toBe(
        "export const a = 1\n",
      );
      await expect(fs.access(path.join(wt, "src/new.ts"))).rejects.toThrow();
      await expect(fs.access(path.join(wt, "nested/deep.ts"))).rejects.toThrow();

      // A fresh snapshot now diffs clean against the restored tree.
      const snap2 = await snapshotWorktree(wt);
      const after = await captureWorktreePatch(wt, snap2);
      expect(after.patch.trim()).toBe("");
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });
});

describe("evaluateTurnDiff", () => {
  it("accepts a clean diff and records evidence", async () => {
    const wt = await tempRepo();
    try {
      const snap = await snapshotWorktree(wt);
      await fs.writeFile(path.join(wt, "src/a.ts"), "export const a = 2\n");
      const broker = new DefaultActionBroker(wt, "run-1");
      const v = await evaluateTurnDiff({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        baseTree: snap,
      });
      expect(v.verdict).toBe("accept");
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });

  it("rolls back when a policy denies the turn diff", async () => {
    const wt = await tempRepo();
    try {
      const snap = await snapshotWorktree(wt);
      await fs.writeFile(path.join(wt, "src/a.ts"), "export const a = 2\n");
      const deny: ActionEvaluator = (r) =>
        r.kind === "file.patch"
          ? { effect: "deny", ruleIds: ["x"], reason: "no turn writes" }
          : null;
      const broker = new DefaultActionBroker(wt, "run-1", {
        evaluators: [deny],
      });
      const v = await evaluateTurnDiff({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        baseTree: snap,
      });
      expect(v.verdict).toBe("rollback");
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });

  it("returns approve when a policy requires approval for the turn diff", async () => {
    const wt = await tempRepo();
    try {
      const snap = await snapshotWorktree(wt);
      await fs.writeFile(path.join(wt, "src/a.ts"), "export const a = 2\n");
      const hold: ActionEvaluator = (r) =>
        r.kind === "file.patch"
          ? { effect: "require_approval", ruleIds: ["h"], reason: "needs ok" }
          : null;
      const broker = new DefaultActionBroker(wt, "run-1", {
        evaluators: [hold],
      });
      const v = await evaluateTurnDiff({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        baseTree: snap,
      });
      expect(v.verdict).toBe("approve");
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });

  it("rolls back a diff that adds a secret file (built-in safety)", async () => {
    const wt = await tempRepo();
    try {
      const snap = await snapshotWorktree(wt);
      await fs.writeFile(path.join(wt, ".env"), "API_KEY=sk-livesecret\n");
      const broker = new DefaultActionBroker(wt, "run-1");
      const v = await evaluateTurnDiff({
        broker,
        runId: "run-1",
        roleId: "executor",
        worktree: wt,
        baseTree: snap,
      });
      expect(v.verdict).toBe("rollback");
    } finally {
      await fs.rm(wt, { recursive: true, force: true });
    }
  });
});
