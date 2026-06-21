import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { proposeResolutions } from "../src/git/merge-resolve.js";
import {
  applyResolvedMerge,
  undoMerge,
  readMergeRecord,
  MergeError,
} from "../src/git/merge-service.js";
import type { AssistProviderRunner } from "../src/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });
const AKIA = "AKIA" + "IOSFODNN7EXAMPLE";

async function git(cwd: string, ...args: string[]) {
  await execa("git", args, { cwd });
}
async function sha(cwd: string, ref: string): Promise<string> {
  return (await execa("git", ["rev-parse", ref], { cwd })).stdout.trim();
}
async function read(dir: string, f: string): Promise<string> {
  return fs.readFile(path.join(dir, f), "utf8");
}

/** Canned resolver returning fixed JSON, recording every prompt it is given. */
function capturingRunner(prompts: string[]): AssistProviderRunner {
  return async (_p, input) => {
    prompts.push(input.prompt);
    return {
      exitCode: 0,
      normalized: { responseText: '{"resolved":"MERGED","rationale":"ok"}', metrics: null },
    };
  };
}

/** Repo where merging feat into main conflicts on base.txt + code.txt + .env;
 *  code.txt's feat side carries a secret-shaped token. */
async function makeProposeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-resolve-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "one\ntwo\n");
  await fs.writeFile(path.join(dir, "code.txt"), "x = 1\n");
  await fs.writeFile(path.join(dir, ".env"), "A=1\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "setup");

  await git(dir, "checkout", "-q", "-b", "feat", "main");
  await fs.writeFile(path.join(dir, "base.txt"), "feat-one\ntwo\n");
  await fs.writeFile(path.join(dir, "code.txt"), `x = "${AKIA}"\n`);
  await fs.writeFile(path.join(dir, ".env"), "A=feat\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "feat");

  await git(dir, "checkout", "-q", "main");
  await fs.writeFile(path.join(dir, "base.txt"), "main-one\ntwo\n");
  await fs.writeFile(path.join(dir, "code.txt"), "x = 2\n");
  await fs.writeFile(path.join(dir, ".env"), "A=main\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "main");
  return dir;
}

describe("proposeResolutions", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeProposeRepo();
  });

  it("proposes per-hunk resolutions, redacts secrets, refuses secret paths, leaves no scratch", async () => {
    const prompts: string[] = [];
    const mainBefore = await sha(dir, "main");
    const proposal = await proposeResolutions({
      projectRoot: dir,
      source: "feat",
      target: "main",
      runner: capturingRunner(prompts),
    });

    expect(proposal.clean).toBe(false);
    const byFile = Object.fromEntries(proposal.files.map((f) => [f.file, f]));
    // base.txt + code.txt get AI proposals.
    expect(byFile["base.txt"]?.status).toBe("proposed");
    expect(byFile["base.txt"]?.hunks[0]?.proposed).toBe("MERGED");
    expect(byFile["code.txt"]?.status).toBe("proposed");
    // .env is refused outright - never sent to a provider.
    expect(byFile[".env"]?.status).toBe("refusedSecret");
    expect(byFile[".env"]?.hunks).toHaveLength(0);

    // The secret token was redacted before any prompt; raw token never sent.
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.some((p) => p.includes(AKIA))).toBe(false);
    expect(prompts.some((p) => p.includes("[REDACTED:AWS access key id]"))).toBe(true);

    // Read-only: main untouched, no scratch worktree/branch lingers.
    expect(await sha(dir, "main")).toBe(mainBefore);
    const branches = await execa("git", ["branch", "--list", "vibe-merge-resolve-*"], { cwd: dir });
    expect(branches.stdout.trim()).toBe("");
    const wt = await execa("git", ["worktree", "list"], { cwd: dir });
    expect(wt.stdout).not.toMatch(/vibe-merge-resolve-/);
  });
});

/** Repo where merging feat into main conflicts on base.txt + code.txt only. */
async function makeApplyRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-applyres-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "one\ntwo\n");
  await fs.writeFile(path.join(dir, "code.txt"), "x = 1\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "setup");

  await git(dir, "checkout", "-q", "-b", "feat", "main");
  await fs.writeFile(path.join(dir, "base.txt"), "feat-one\ntwo\n");
  await fs.writeFile(path.join(dir, "code.txt"), "x = feat\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "feat");

  await git(dir, "checkout", "-q", "main");
  await fs.writeFile(path.join(dir, "base.txt"), "main-one\ntwo\n");
  await fs.writeFile(path.join(dir, "code.txt"), "x = main\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "main");
  return dir;
}

describe("applyResolvedMerge", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeApplyRepo();
  });

  it("commits a resolved merge and is reversible by undo", async () => {
    const pre = await sha(dir, "main");
    const r = await applyResolvedMerge({
      projectRoot: dir,
      source: "feat",
      target: "main",
      resolvedFiles: [
        { path: "base.txt", content: "resolved-one\ntwo\n" },
        { path: "code.txt", content: "x = resolved\n" },
      ],
      humanConfirmed: true,
    });
    expect(r.mergedSha).not.toBe(pre);
    expect(await read(dir, "base.txt")).toBe("resolved-one\ntwo\n");
    const parents = (await execa("git", ["rev-list", "--parents", "-n", "1", "main"], { cwd: dir })).stdout.trim().split(/\s+/);
    expect(parents).toHaveLength(3); // real 2-parent merge
    expect((await readMergeRecord(dir, "main"))?.status).toBe("applied");

    const u = await undoMerge({ projectRoot: dir, target: "main" });
    expect(u.undone).toBe(true);
    expect(await sha(dir, "main")).toBe(pre);
  });

  it("refuses a resolution path that is not one of the conflicted files", async () => {
    const pre = await sha(dir, "main");
    await expect(
      applyResolvedMerge({
        projectRoot: dir,
        source: "feat",
        target: "main",
        resolvedFiles: [{ path: "code.txt", content: "x\n" }, { path: "evil.txt", content: "pwn" }],
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/not one of this merge's conflicted files/);
    expect(await sha(dir, "main")).toBe(pre);
    expect(await readMergeRecord(dir, "main")).toBeNull();
  });

  it("refuses a resolution that still contains conflict markers", async () => {
    const pre = await sha(dir, "main");
    await expect(
      applyResolvedMerge({
        projectRoot: dir,
        source: "feat",
        target: "main",
        resolvedFiles: [{ path: "base.txt", content: "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feat\n" }],
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/conflict markers/);
    expect(await sha(dir, "main")).toBe(pre);
  });

  it("refuses when not all conflicts are resolved", async () => {
    const pre = await sha(dir, "main");
    await expect(
      applyResolvedMerge({
        projectRoot: dir,
        source: "feat",
        target: "main",
        resolvedFiles: [{ path: "base.txt", content: "only this one\n" }],
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/not all conflicts were resolved/i);
    expect(await sha(dir, "main")).toBe(pre);
  });
});

/** Repo where merging feat into main conflicts on a secret-like path (.env). */
async function makeSecretApplyRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-applysec-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, ".env"), "A=1\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "setup");
  await git(dir, "checkout", "-q", "-b", "feat", "main");
  await fs.writeFile(path.join(dir, ".env"), "A=feat\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "feat");
  await git(dir, "checkout", "-q", "main");
  await fs.writeFile(path.join(dir, ".env"), "A=main\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "main");
  return dir;
}

/** Repo where merging feat into main conflicts on a SYMLINK `link`, whose
 *  checked-out (ours/main) target is `linkTarget`. */
async function makeSymlinkConflictRepo(linkTarget: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-symlink-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "innocent.txt"), "innocent");
  await fs.symlink("innocent.txt", path.join(dir, "link"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "setup");

  await git(dir, "checkout", "-q", "-b", "feat", "main");
  await fs.rm(path.join(dir, "link"));
  await fs.symlink("feat-target.txt", path.join(dir, "link"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "feat");

  await git(dir, "checkout", "-q", "main");
  await fs.rm(path.join(dir, "link"));
  await fs.symlink(linkTarget, path.join(dir, "link"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "main");
  return dir;
}

describe("applyResolvedMerge - symlink escape (adversarial-review BLOCKER)", () => {
  it("refuses to write through a conflicted symlink pointing outside the repo", async () => {
    const victimDir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-victim-"));
    const victim = path.join(victimDir, "secret.txt");
    await fs.writeFile(victim, "SAFE");
    const dir = await makeSymlinkConflictRepo(victim); // ours: link -> absolute victim
    const pre = await sha(dir, "main");

    await expect(
      applyResolvedMerge({
        projectRoot: dir,
        source: "feat",
        target: "main",
        resolvedFiles: [{ path: "link", content: "PWNED" }],
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/symlink|outside the project worktree/);

    expect(await fs.readFile(victim, "utf8")).toBe("SAFE"); // never written
    expect(await sha(dir, "main")).toBe(pre); // tip unmoved
    expect(await readMergeRecord(dir, "main")).toBeNull();
  });

  it("refuses to write through a conflicted symlink into .git/hooks", async () => {
    const dir = await makeSymlinkConflictRepo(".git/hooks/post-merge");
    const hook = path.join(dir, ".git", "hooks", "post-merge");
    const pre = await sha(dir, "main");

    await expect(
      applyResolvedMerge({
        projectRoot: dir,
        source: "feat",
        target: "main",
        resolvedFiles: [{ path: "link", content: "#!/bin/sh\ntouch /tmp/PWNED\n" }],
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/symlink|outside the project worktree/);

    // The hook payload was never written.
    const hookContent = await fs.readFile(hook, "utf8").catch(() => "");
    expect(hookContent).not.toContain("touch /tmp/PWNED");
    expect(await sha(dir, "main")).toBe(pre);
  });
});

describe("applyResolvedMerge - secret path", () => {
  it("refuses to write a resolution to a secret-like path", async () => {
    const dir = await makeSecretApplyRepo();
    const pre = await sha(dir, "main");
    await expect(
      applyResolvedMerge({
        projectRoot: dir,
        source: "feat",
        target: "main",
        resolvedFiles: [{ path: ".env", content: "A=resolved\n" }],
        humanConfirmed: true,
      }),
    ).rejects.toThrow(/secret-like path/);
    expect(await sha(dir, "main")).toBe(pre);
    expect(await readMergeRecord(dir, "main")).toBeNull();
  });
});
