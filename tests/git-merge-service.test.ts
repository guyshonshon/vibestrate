import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import {
  predictMerge,
  applyMerge,
  undoMerge,
  readMergeRecord,
  MergeError,
  type MergeRecord,
} from "../src/git/merge-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function git(cwd: string, ...args: string[]) {
  await execa("git", args, { cwd });
}
async function sha(cwd: string, ref: string): Promise<string> {
  return (await execa("git", ["rev-parse", ref], { cwd })).stdout.trim();
}
async function fileExists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

/**
 * Repo on `main` with:
 *  - feat-clean: adds clean.txt (merges into main with no conflict)
 *  - feat-conf: edits base.txt line 1, AND main also edits line 1 afterwards
 *    (so feat-conf <-> main conflict on base.txt)
 */
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-merge-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "line one\nline two\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "vibestrate setup");

  await git(dir, "checkout", "-q", "-b", "feat-clean", "main");
  await fs.writeFile(path.join(dir, "clean.txt"), "clean");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "feat-clean");

  await git(dir, "checkout", "-q", "-b", "feat-conf", "main");
  await fs.writeFile(path.join(dir, "base.txt"), "line one - from feat\nline two\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "feat-conf");

  await git(dir, "checkout", "-q", "main");
  await fs.writeFile(path.join(dir, "base.txt"), "line one - from main\nline two\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "main edit");
  return dir;
}

async function noScratchSurvives(dir: string) {
  const branches = await execa("git", ["branch", "--list", "vibe-merge-pred-*"], {
    cwd: dir,
  });
  expect(branches.stdout.trim()).toBe("");
  const wt = await execa("git", ["worktree", "list"], { cwd: dir });
  expect(wt.stdout).not.toMatch(/vibe-merge-pred-/);
}

describe("predictMerge", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("predicts a clean merge and leaves no scratch behind", async () => {
    const p = await predictMerge({ projectRoot: dir, source: "feat-clean", target: "main" });
    expect(p.clean).toBe(true);
    expect(p.alreadyUpToDate).toBe(false);
    expect(p.conflictedFiles).toEqual([]);
    await noScratchSurvives(dir);
  });

  it("predicts a conflict with whole-file names and leaves no scratch behind", async () => {
    const p = await predictMerge({ projectRoot: dir, source: "feat-conf", target: "main" });
    expect(p.clean).toBe(false);
    expect(p.conflictedFiles).toContain("base.txt");
    await noScratchSurvives(dir);
  });

  it("never moves the real target tip", async () => {
    const before = await sha(dir, "main");
    await predictMerge({ projectRoot: dir, source: "feat-clean", target: "main" });
    await predictMerge({ projectRoot: dir, source: "feat-conf", target: "main" });
    expect(await sha(dir, "main")).toBe(before);
  });
});

describe("applyMerge", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("applies a clean merge, writes the record, and creates a real merge commit", async () => {
    const pre = await sha(dir, "main");
    const r = await applyMerge({
      projectRoot: dir,
      source: "feat-clean",
      target: "main",
      humanConfirmed: true,
    });
    expect(r.alreadyUpToDate).toBe(false);
    expect(r.preSha).toBe(pre);
    expect(r.mergedSha).not.toBe(pre);
    expect(await sha(dir, "main")).toBe(r.mergedSha);
    // It is a real --no-ff merge commit (two parents).
    const parents = (await execa("git", ["rev-list", "--parents", "-n", "1", "main"], { cwd: dir })).stdout.trim().split(/\s+/);
    expect(parents).toHaveLength(3);
    expect(await fileExists(path.join(dir, "clean.txt"))).toBe(true);
    // Record persisted with the finalized merge sha.
    const rec = await readMergeRecord(dir, "main");
    expect(rec?.preSha).toBe(pre);
    expect(rec?.mergedSha).toBe(r.mergedSha);
    expect(rec?.status).toBe("applied");
  });

  it("refuses a conflicting merge, aborts, leaves the tip unchanged and no record", async () => {
    const pre = await sha(dir, "main");
    await expect(
      applyMerge({ projectRoot: dir, source: "feat-conf", target: "main", humanConfirmed: true }),
    ).rejects.toBeInstanceOf(MergeError);
    expect(await sha(dir, "main")).toBe(pre); // tip unchanged
    // No half-merge left behind, no record left behind.
    const mergeHead = await execa("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: dir, reject: false });
    expect(mergeHead.exitCode).not.toBe(0);
    expect(await readMergeRecord(dir, "main")).toBeNull();
  });

  it("refuses when the target is not the checked-out branch (never moves HEAD)", async () => {
    await git(dir, "checkout", "-q", "feat-clean"); // HEAD != target
    const mainPre = await sha(dir, "main");
    await expect(
      applyMerge({ projectRoot: dir, source: "feat-conf", target: "main", humanConfirmed: true }),
    ).rejects.toThrow(/not "main"|Check out/);
    expect(await sha(dir, "main")).toBe(mainPre);
    // HEAD did not move off feat-clean.
    expect((await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir })).stdout.trim()).toBe("feat-clean");
  });

  it("refuses on a dirty target tree", async () => {
    await fs.writeFile(path.join(dir, "base.txt"), "dirty edit\n");
    await expect(
      applyMerge({ projectRoot: dir, source: "feat-clean", target: "main", humanConfirmed: true }),
    ).rejects.toThrow(/uncommitted changes/);
  });
});

describe("undoMerge", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("restores the pre-merge sha and removes the record", async () => {
    const pre = await sha(dir, "main");
    await applyMerge({ projectRoot: dir, source: "feat-clean", target: "main", humanConfirmed: true });
    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(true);
    if (r.undone) expect(r.preSha).toBe(pre);
    expect(await sha(dir, "main")).toBe(pre);
    expect(await fileExists(path.join(dir, "clean.txt"))).toBe(false);
    expect(await readMergeRecord(dir, "main")).toBeNull();
  });

  it("refuses when something was built on top of the merge", async () => {
    await applyMerge({ projectRoot: dir, source: "feat-clean", target: "main", humanConfirmed: true });
    await fs.writeFile(path.join(dir, "more.txt"), "more");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "built on top");
    const tip = await sha(dir, "main");
    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(false);
    if (!r.undone) expect(r.reason).toMatch(/built on top|advanced/);
    expect(await sha(dir, "main")).toBe(tip); // unchanged
  });

  it("refuses on drift (recorded pre-merge sha no longer resolves)", async () => {
    await applyMerge({ projectRoot: dir, source: "feat-clean", target: "main", humanConfirmed: true });
    // Corrupt the record's preSha to a sha that doesn't exist in the repo.
    const recPath = path.join(dir, ".vibestrate", "merge", "main.json");
    const rec = JSON.parse(await fs.readFile(recPath, "utf8")) as MergeRecord;
    const tip = await sha(dir, "main");
    rec.preSha = "0".repeat(40);
    await fs.writeFile(recPath, JSON.stringify(rec));
    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(false);
    if (!r.undone) expect(r.reason).toMatch(/drifted|no longer exists/);
    expect(await sha(dir, "main")).toBe(tip); // unchanged
  });

  it("refuses when the pre-merge point is already on the upstream (push detection)", async () => {
    const pre = await sha(dir, "main");
    await applyMerge({ projectRoot: dir, source: "feat-clean", target: "main", humanConfirmed: true });
    const merged = await sha(dir, "main");
    // Create a fake origin and push the merged main, so origin/main contains it.
    const originPath = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-origin-"));
    await git(originPath, "init", "-q", "--bare");
    await git(dir, "remote", "add", "origin", originPath);
    await git(dir, "push", "-q", "-u", "origin", "main");
    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(false);
    if (!r.undone) expect(r.reason).toMatch(/upstream|pushed/);
    expect(await sha(dir, "main")).toBe(merged); // unchanged
    expect(pre).not.toBe(merged);
  });

  it("undoes a crashed mid-apply (record present, merge committed, never finalized)", async () => {
    // Simulate a process killed AFTER the merge commit landed but BEFORE the
    // record was finalized with mergedSha: write the applying-record, then do
    // the real merge by hand, leaving status="applying" / mergedSha=null.
    const pre = await sha(dir, "main");
    const srcSha = await sha(dir, "feat-clean");
    const recDir = path.join(dir, ".vibestrate", "merge");
    await fs.mkdir(recDir, { recursive: true });
    const rec: MergeRecord = {
      target: "main",
      source: "feat-clean",
      preSha: pre,
      sourceSha: srcSha,
      mergedSha: null,
      status: "applying",
      recordedAt: new Date().toISOString(),
      mergedAt: null,
    };
    await fs.writeFile(path.join(recDir, "main.json"), JSON.stringify(rec));
    await git(dir, "merge", "--no-ff", "--no-edit", "feat-clean");
    const mergedTip = await sha(dir, "main");
    expect(mergedTip).not.toBe(pre);

    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(true);
    expect(await sha(dir, "main")).toBe(pre);
    expect(await fileExists(path.join(dir, "clean.txt"))).toBe(false);
    expect(await readMergeRecord(dir, "main")).toBeNull();
  });

  // Adversarial-review BLOCKER regression: a stale `applying` record must NOT
  // let undo reset over an UNRELATED merge that merely shares preSha as a parent.
  it("refuses to undo an unrelated merge that only shares preSha as a parent", async () => {
    const pre = await sha(dir, "main");
    // The user does a real, unrelated merge of feat-conf-resolved... use a
    // second clean branch so the merge is genuinely a different one.
    await git(dir, "checkout", "-q", "-b", "feat-other", "main");
    await fs.writeFile(path.join(dir, "other.txt"), "other");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "-m", "feat-other");
    await git(dir, "checkout", "-q", "main");
    await git(dir, "merge", "--no-ff", "--no-edit", "feat-other"); // parents [pre, feat-other]
    const realTip = await sha(dir, "main");

    // Plant a stale applying-record claiming a DIFFERENT source (feat-clean).
    const recDir = path.join(dir, ".vibestrate", "merge");
    await fs.mkdir(recDir, { recursive: true });
    const rec: MergeRecord = {
      target: "main",
      source: "feat-clean",
      preSha: pre,
      sourceSha: await sha(dir, "feat-clean"),
      mergedSha: null,
      status: "applying",
      recordedAt: new Date().toISOString(),
      mergedAt: null,
    };
    await fs.writeFile(path.join(recDir, "main.json"), JSON.stringify(rec));

    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(false);
    if (!r.undone) expect(r.reason).toMatch(/cannot confirm/i);
    // The unrelated merge and its work survive untouched.
    expect(await sha(dir, "main")).toBe(realTip);
    expect(await fileExists(path.join(dir, "other.txt"))).toBe(true);
  });

  // Adversarial-review BLOCKER (2nd pass) regression: a tip with the right
  // parents {preSha, sourceSha} but EXTRA content amended into the merge commit
  // must NOT be reset away - tree-identity, not parentage.
  it("refuses to undo a merge commit that has work amended in (tree differs)", async () => {
    const pre = await sha(dir, "main");
    const srcSha = await sha(dir, "feat-clean");
    const recDir = path.join(dir, ".vibestrate", "merge");
    await fs.mkdir(recDir, { recursive: true });
    const rec: MergeRecord = {
      target: "main",
      source: "feat-clean",
      preSha: pre,
      sourceSha: srcSha,
      mergedSha: null,
      status: "applying",
      recordedAt: new Date().toISOString(),
      mergedAt: null,
    };
    await fs.writeFile(path.join(recDir, "main.json"), JSON.stringify(rec));
    await git(dir, "merge", "--no-ff", "--no-edit", "feat-clean");
    // Fold extra real work into the merge commit (parents stay [pre, srcSha]).
    await fs.writeFile(path.join(dir, "amended-work.txt"), "precious");
    await git(dir, "add", ".");
    await git(dir, "commit", "-q", "--amend", "--no-edit");
    const amendedTip = await sha(dir, "main");

    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(false);
    if (!r.undone) expect(r.reason).toMatch(/pristine|tree differs|cannot confirm/i);
    expect(await sha(dir, "main")).toBe(amendedTip); // untouched
    expect(await fileExists(path.join(dir, "amended-work.txt"))).toBe(true);
  });

  // Adversarial-review HIGH regression: a normal local-only merge on a branch
  // that tracks an upstream at the pre-merge point is still undoable - the
  // unpushed merge is NOT on the upstream.
  it("undoes a local-only merge even when the branch tracks an upstream at preSha", async () => {
    const pre = await sha(dir, "main");
    // Publish main at the pre-merge point, then merge locally without pushing.
    const originPath = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-origin-"));
    await git(originPath, "init", "-q", "--bare");
    await git(dir, "remote", "add", "origin", originPath);
    await git(dir, "push", "-q", "-u", "origin", "main"); // origin/main == preSha
    await applyMerge({ projectRoot: dir, source: "feat-clean", target: "main", humanConfirmed: true });
    expect(await sha(dir, "main")).not.toBe(pre);

    const r = await undoMerge({ projectRoot: dir, target: "main" });
    expect(r.undone).toBe(true); // merge was never pushed -> reversible
    expect(await sha(dir, "main")).toBe(pre);
  });
});
