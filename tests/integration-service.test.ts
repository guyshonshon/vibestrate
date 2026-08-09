import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import {
  mergePreview,
  integrate,
  finishIntegration,
  listMergeReadyRuns,
  IntegrationError,
} from "../src/git/integration-service.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function git(cwd: string, ...args: string[]) {
  await execa("git", args, { cwd });
}

// A repo on `main` with two non-overlapping branches (feat-a, feat-b) and two
// that edit the same line of base.txt (feat-c, feat-c2 → conflict together).
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-integ-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "line one\nline two\n");
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  // Isolate worktrees inside this temp project so parallel test files (which
  // share the tmp base the default worktreeDir resolves to) don't collide.
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "vibestrate setup");

  const branch = async (name: string, fn: () => Promise<void>) => {
    await git(dir, "checkout", "-q", "-b", name, "main");
    await fn();
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", name);
    await git(dir, "checkout", "-q", "main");
  };
  await branch("feat-a", async () => fs.writeFile(path.join(dir, "a.txt"), "A"));
  await branch("feat-b", async () => fs.writeFile(path.join(dir, "b.txt"), "B"));
  await branch("feat-c", async () =>
    fs.writeFile(path.join(dir, "base.txt"), "line one - C\nline two\n"),
  );
  await branch("feat-c2", async () =>
    fs.writeFile(path.join(dir, "base.txt"), "line one - C2\nline two\n"),
  );
  return dir;
}

describe("integration - mergePreview", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("reports clean for non-overlapping branches", async () => {
    const r = await mergePreview({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }, { branch: "feat-b" }],
    });
    expect(r.allClean).toBe(true);
    expect(r.results.map((x) => x.clean)).toEqual([true, true]);
  });

  it("flags the conflicting branch with its conflicted files (cumulative)", async () => {
    const r = await mergePreview({
      projectRoot: dir,
      branches: [{ branch: "feat-c" }, { branch: "feat-c2" }],
    });
    expect(r.allClean).toBe(false);
    expect(r.results[0]!.clean).toBe(true); // feat-c merges onto base
    expect(r.results[1]!.clean).toBe(false); // feat-c2 conflicts with feat-c
    expect(r.results[1]!.conflictedFiles).toContain("base.txt");
  });

  it("notes a missing branch", async () => {
    const r = await mergePreview({
      projectRoot: dir,
      branches: [{ branch: "ghost-branch" }],
    });
    expect(r.results[0]!.clean).toBe(false);
    expect(r.results[0]!.note).toMatch(/not found/);
  });

  it("leaves the repo clean - no scratch branch or worktree lingers", async () => {
    await mergePreview({ projectRoot: dir, branches: [{ branch: "feat-a" }] });
    const branches = await execa("git", ["branch", "--list", "vibe-preview-*"], { cwd: dir });
    expect(branches.stdout.trim()).toBe("");
    const wt = await execa("git", ["worktree", "list"], { cwd: dir });
    expect(wt.stdout).not.toMatch(/vibe-preview-/);
  });
});

describe("integration - integrate", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("merges clean branches into a fresh integration branch (main untouched)", async () => {
    const mainBefore = (await execa("git", ["rev-parse", "main"], { cwd: dir })).stdout;
    const r = await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }, { branch: "feat-b" }],
      integrationBranch: "integration/test",
    });
    expect(r.stoppedAt).toBeNull();
    expect(r.integrated.every((x) => x.clean)).toBe(true);
    // The integration branch has both files; main is unchanged.
    const files = await execa("git", ["ls-tree", "-r", "--name-only", "integration/test"], { cwd: dir });
    expect(files.stdout).toContain("a.txt");
    expect(files.stdout).toContain("b.txt");
    const mainAfter = (await execa("git", ["rev-parse", "main"], { cwd: dir })).stdout;
    expect(mainAfter).toBe(mainBefore);
  });

  it("stops at the first conflicting branch", async () => {
    const r = await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-c" }, { branch: "feat-c2" }, { branch: "feat-a" }],
      integrationBranch: "integration/conflicty",
    });
    expect(r.stoppedAt).toBe("feat-c2");
    expect(r.integrated.map((x) => x.clean)).toEqual([true, false]);
    // feat-a after the conflict was never attempted.
    expect(r.integrated).toHaveLength(2);
  });

  it("refuses the main branch and an existing branch", async () => {
    await expect(
      integrate({ projectRoot: dir, branches: [{ branch: "feat-a" }], integrationBranch: "main" }),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      integrate({ projectRoot: dir, branches: [{ branch: "feat-a" }], integrationBranch: "feat-b" }),
    ).rejects.toThrow(/already exists/);
  });

  it("errors clearly when the base branch does not exist", async () => {
    await expect(
      integrate({
        projectRoot: dir,
        branches: [{ branch: "feat-a" }],
        integrationBranch: "integration/x",
        baseBranch: "no-such-base",
      }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      mergePreview({ projectRoot: dir, branches: [{ branch: "feat-a" }], baseBranch: "no-such-base" }),
    ).rejects.toThrow(/does not exist/);
  });
});

describe("integration - listMergeReadyRuns", () => {
  it("lists only merge_ready runs that have a branch", async () => {
    const dir = await makeRepo();
    const mk = async (runId: string, status: "merge_ready" | "blocked", branch: string | null) => {
      const store = new RunStateStore(dir, runId);
      let s = createInitialState({
        runId,
        task: `task ${runId}`,
        projectRoot: dir,
        worktreePath: null,
        branchName: branch,
        maxReviewLoops: 2,
      });
      s = { ...s, status, branchName: branch };
      await store.write(s);
    };
    await mk("r-ready", "merge_ready", "feat-a");
    await mk("r-blocked", "blocked", "feat-b");
    await mk("r-nobranch", "merge_ready", null);
    const out = await listMergeReadyRuns(dir);
    expect(out.map((r) => r.runId)).toEqual(["r-ready"]);
    expect(out[0]!.branchName).toBe("feat-a");
  });
});

// The merge lock is a directory holding a pid file. Releasing it with rmdir
// failed ENOTEMPTY and the swallowed error left it on disk, so the NEXT finish
// hit stale-lock recovery, read a pid that was still alive (the same long-lived
// `vibe ui` server that did the first merge), and concluded a merge was in
// progress. Every merge-to-main after the first was refused until the user
// deleted the directory by hand.
describe("integration - finishIntegration releases its lock", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
    // finish refuses on a dirty tree, and this fixture keeps both the worktrees
    // and `.vibestrate/` inside the repo untracked. A real project gitignores
    // them (`vibe init` writes that), so mirror it here rather than reshaping
    // the shared fixture.
    await fs.writeFile(
      path.join(dir, ".git", "info", "exclude"),
      "worktrees/\n.vibestrate/\n",
    );
  });

  const lockDir = (root: string) =>
    path.join(root, ".vibestrate", "integration", ".finish-lock");

  it("leaves no lock behind, so a second finish in the same process still runs", async () => {
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-a" }],
      integrationBranch: "integ-1",
    });
    await finishIntegration({
      projectRoot: dir,
      integrationBranch: "integ-1",
      humanConfirmed: true,
    });
    await expect(fs.stat(lockDir(dir))).rejects.toThrow();

    // The real regression: this process is still alive, exactly like the
    // dashboard server, so a leaked lock reads as "held by a live process".
    await integrate({
      projectRoot: dir,
      branches: [{ branch: "feat-b" }],
      integrationBranch: "integ-2",
    });
    const second = await finishIntegration({
      projectRoot: dir,
      integrationBranch: "integ-2",
      humanConfirmed: true,
    });
    expect(second.intoBranch).toBe("main");
    await expect(fs.stat(lockDir(dir))).rejects.toThrow();
  });

  it("releases the lock when the merge is refused, not just when it succeeds", async () => {
    await expect(
      finishIntegration({
        projectRoot: dir,
        integrationBranch: "never-integrated",
        humanConfirmed: true,
      }),
    ).rejects.toThrow(IntegrationError);
    await expect(fs.stat(lockDir(dir))).rejects.toThrow();
  });
});
