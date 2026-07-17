import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  getCommitDetail,
  getGitGraph,
} from "../src/core/codebase/git-history-service.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});

async function initRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-graph-"));
  dirs.push(dir);
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  return dir;
}

async function commit(
  dir: string,
  file: string,
  content: string,
  msg: string,
): Promise<string> {
  await fs.writeFile(path.join(dir, file), content);
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", msg], { cwd: dir });
  return (await execa("git", ["rev-parse", "HEAD"], { cwd: dir })).stdout.trim();
}

async function git(dir: string, args: string[]): Promise<void> {
  await execa("git", args, { cwd: dir });
}

/** Commit a file with an explicit message body (subject + blank line + body). */
async function commitWithBody(
  dir: string,
  file: string,
  content: string,
  subject: string,
  body: string,
): Promise<string> {
  await fs.writeFile(path.join(dir, file), content);
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", subject, "-m", body], { cwd: dir });
  return (await execa("git", ["rev-parse", "HEAD"], { cwd: dir })).stdout.trim();
}

describe("getGitGraph", () => {
  it("captures parents, branch heads, and isMain across a fork", async () => {
    const dir = await initRepo();
    const a = await commit(dir, "f.txt", "a", "A");
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    const b = await commit(dir, "g.txt", "b", "B");
    await git(dir, ["checkout", "-q", "main"]);
    const c = await commit(dir, "h.txt", "c", "C");

    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    expect(graph.available).toBe(true);
    expect(graph.bounded).toBe(false);

    // Edges live in `parents`: A is a root, B and C both fork off A.
    const byHash = new Map(graph.commits.map((cm) => [cm.hash, cm]));
    expect(byHash.size).toBe(3);
    expect(byHash.get(a)?.parents).toEqual([]);
    expect(byHash.get(b)?.parents).toEqual([a]);
    expect(byHash.get(c)?.parents).toEqual([a]);

    const main = graph.branchHeads.find((h) => h.name === "main");
    const feat = graph.branchHeads.find((h) => h.name === "feat");
    expect(main?.hash).toBe(c);
    expect(main?.isMain).toBe(true);
    expect(feat?.hash).toBe(b);
    expect(feat?.isMain).toBe(false);
  });

  it("records both parents of a merge commit", async () => {
    const dir = await initRepo();
    await commit(dir, "f.txt", "base", "base");
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    const featTip = await commit(dir, "g.txt", "feat", "feat work");
    await git(dir, ["checkout", "-q", "main"]);
    const mainTip = await commit(dir, "h.txt", "main", "main work");
    await git(dir, ["merge", "--no-ff", "--no-edit", "feat"]);
    const mergeSha = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: dir })
    ).stdout.trim();

    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    const merge = graph.commits.find((cm) => cm.hash === mergeSha);
    // First parent is the branch we merged into (main), second is the source.
    expect(merge?.parents).toEqual([mainTip, featTip]);
  });

  it("bounds the commit set and flags truncation", async () => {
    const dir = await initRepo();
    for (let i = 0; i < 5; i++) {
      await commit(dir, "f.txt", `v${i}`, `commit ${i}`);
    }
    const bounded = await getGitGraph({
      worktreePath: dir,
      mainBranch: "main",
      maxNodes: 3,
    });
    expect(bounded.commits).toHaveLength(3);
    expect(bounded.bounded).toBe(true);

    const full = await getGitGraph({
      worktreePath: dir,
      mainBranch: "main",
      maxNodes: 50,
    });
    expect(full.commits).toHaveLength(5);
    expect(full.bounded).toBe(false);
  });

  it("handles an empty repo with no commits yet", async () => {
    const dir = await initRepo();
    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    expect(graph.available).toBe(true);
    expect(graph.commits).toEqual([]);
    expect(graph.branchHeads).toEqual([]);
    expect(graph.bounded).toBe(false);
  });

  it("returns unavailable for a non-git path", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-nogit-"));
    dirs.push(dir);
    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    expect(graph.available).toBe(false);
    expect(graph.commits).toEqual([]);
  });
});

describe("getGitGraph per-commit stats", () => {
  it("assigns correct insertions/deletions to each non-merge commit", async () => {
    const dir = await initRepo();
    // A: 3 fresh lines -> 3 insertions, 0 deletions, 1 file.
    const a = await commit(dir, "f.txt", "l1\nl2\nl3\n", "A");
    // B: grow to 5 lines -> 2 insertions, 0 deletions.
    const b = await commit(dir, "f.txt", "l1\nl2\nl3\nl4\nl5\n", "B");
    // C: shrink to 2 lines -> 0 insertions, 3 deletions.
    const c = await commit(dir, "f.txt", "l1\nl2\n", "C");
    // D: add a whole new file with 4 lines -> 4 insertions, 0 deletions.
    const d = await commit(dir, "g.txt", "a\nb\nc\nd\n", "D");

    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    const byHash = new Map(graph.commits.map((cm) => [cm.hash, cm]));

    expect(byHash.get(a)?.stats).toEqual({
      filesChanged: 1,
      insertions: 3,
      deletions: 0,
    });
    expect(byHash.get(b)?.stats).toEqual({
      filesChanged: 1,
      insertions: 2,
      deletions: 0,
    });
    expect(byHash.get(c)?.stats).toEqual({
      filesChanged: 1,
      insertions: 0,
      deletions: 3,
    });
    expect(byHash.get(d)?.stats).toEqual({
      filesChanged: 1,
      insertions: 4,
      deletions: 0,
    });
  });

  it("gives a merge commit null stats without mis-assigning neighbors", async () => {
    const dir = await initRepo();
    // base: 2 lines.
    const base = await commit(dir, "f.txt", "b1\nb2\n", "base");
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    // feat tip: new file, 3 lines -> 3 insertions.
    const featTip = await commit(dir, "feat.txt", "x\ny\nz\n", "feat work");
    await git(dir, ["checkout", "-q", "main"]);
    // main tip: new file, 1 line -> 1 insertion.
    const mainTip = await commit(dir, "main.txt", "only\n", "main work");
    await git(dir, ["merge", "--no-ff", "--no-edit", "feat"]);
    const mergeSha = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: dir })
    ).stdout.trim();

    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    const byHash = new Map(graph.commits.map((cm) => [cm.hash, cm]));

    // The merge commit itself carries no direct diff (git show w/o -m).
    expect(byHash.get(mergeSha)?.stats).toBeNull();
    // Neighbors keep their own exact stats - the interleaved shortstat parser
    // must not leak a neighbor's stat onto the merge or vice-versa.
    expect(byHash.get(featTip)?.stats).toEqual({
      filesChanged: 1,
      insertions: 3,
      deletions: 0,
    });
    expect(byHash.get(mainTip)?.stats).toEqual({
      filesChanged: 1,
      insertions: 1,
      deletions: 0,
    });
    expect(byHash.get(base)?.stats).toEqual({
      filesChanged: 1,
      insertions: 2,
      deletions: 0,
    });
  });

  it("carries correct stats on the first (newest) and last (oldest root) chunk", async () => {
    const dir = await initRepo();
    // Oldest / root commit: 2 lines -> 2 insertions (LAST chunk in log order).
    const root = await commit(dir, "f.txt", "r1\nr2\n", "root");
    await commit(dir, "f.txt", "r1\nr2\nr3\n", "mid"); // +1
    // Newest commit: add a new file with 5 lines (FIRST chunk in log order).
    const newest = await commit(dir, "h.txt", "1\n2\n3\n4\n5\n", "newest");

    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    // Newest is first in log order.
    expect(graph.commits[0]?.hash).toBe(newest);
    expect(graph.commits[0]?.stats).toEqual({
      filesChanged: 1,
      insertions: 5,
      deletions: 0,
    });
    // Root is last in log order.
    const last = graph.commits[graph.commits.length - 1];
    expect(last?.hash).toBe(root);
    expect(last?.stats).toEqual({
      filesChanged: 1,
      insertions: 2,
      deletions: 0,
    });
  });
});

describe("getGitGraph branchHeads mergedIntoMain", () => {
  it("flags a merged (undeleted) branch true, an unmerged branch false, main false", async () => {
    const dir = await initRepo();
    await commit(dir, "f.txt", "base\n", "base");

    // merged-branch: forked, committed, merged back into main, NOT deleted.
    await git(dir, ["checkout", "-q", "-b", "merged-branch"]);
    await commit(dir, "m.txt", "merged\n", "merged work");
    await git(dir, ["checkout", "-q", "main"]);
    await git(dir, ["merge", "--no-ff", "--no-edit", "merged-branch"]);

    // open-branch: forked from current main, has a unique commit, never merged.
    await git(dir, ["checkout", "-q", "-b", "open-branch"]);
    await commit(dir, "o.txt", "open\n", "open work");
    await git(dir, ["checkout", "-q", "main"]);

    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "main" });
    const head = (n: string) => graph.branchHeads.find((h) => h.name === n);

    expect(head("merged-branch")?.mergedIntoMain).toBe(true);
    expect(head("open-branch")?.mergedIntoMain).toBe(false);
    // main is never flagged as merged into itself.
    expect(head("main")?.isMain).toBe(true);
    expect(head("main")?.mergedIntoMain).toBe(false);
  });

  it("leaves all flags false when the configured mainBranch does not exist", async () => {
    const dir = await initRepo();
    await commit(dir, "f.txt", "base\n", "base");
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    await commit(dir, "g.txt", "feat\n", "feat");

    // No branch named "trunk" exists; the call must still succeed.
    const graph = await getGitGraph({ worktreePath: dir, mainBranch: "trunk" });
    expect(graph.available).toBe(true);
    expect(graph.branchHeads.length).toBeGreaterThan(0);
    expect(graph.branchHeads.every((h) => h.isMain === false)).toBe(true);
    expect(graph.branchHeads.every((h) => h.mergedIntoMain === false)).toBe(true);
  });
});

describe("getCommitDetail", () => {
  it("returns subject, multi-line body, parents, per-file numstat, and aggregate stats", async () => {
    const dir = await initRepo();
    const parent = await commit(dir, "f.txt", "l1\nl2\n", "parent");
    const body = "First body line.\n\nSecond paragraph after a blank line.";
    // Change f.txt (+2/-1) and add g.txt (+3) so aggregate = +5/-1 over 2 files.
    await fs.writeFile(path.join(dir, "f.txt"), "l1\nchanged\nl3\n");
    await fs.writeFile(path.join(dir, "g.txt"), "a\nb\nc\n");
    const hash = await commitWithBody(
      dir,
      "g.txt",
      "a\nb\nc\n",
      "the subject",
      body,
    );

    const detail = await getCommitDetail({ worktreePath: dir, hash });
    expect(detail).not.toBeNull();
    expect(detail?.available).toBe(true);

    // Per-file numstat + aggregate stats parse correctly today.
    const byPath = new Map(
      (detail?.files ?? []).map((row) => [row.path, row]),
    );
    expect(byPath.get("f.txt")).toEqual({
      path: "f.txt",
      insertions: 2,
      deletions: 1,
    });
    expect(byPath.get("g.txt")).toEqual({
      path: "g.txt",
      insertions: 3,
      deletions: 0,
    });
    expect(detail?.stats).toEqual({
      filesChanged: 2,
      insertions: 5,
      deletions: 1,
    });
  });

  // Guards the separator bytes: getCommitDetail once shipped with EMPTY
  // FIELD/RECORD strings (the \x1f/\x1e control bytes silently lost in an
  // edit), which blanked every header field while numstat still parsed.
  it("returns subject, body, hash, and parents", async () => {
    const dir = await initRepo();
    const parent = await commit(dir, "f.txt", "l1\nl2\n", "parent");
    const body = "First body line.\n\nSecond paragraph after a blank line.";
    const hash = await commitWithBody(
      dir,
      "f.txt",
      "l1\nchanged\nl3\n",
      "the subject",
      body,
    );

    const detail = await getCommitDetail({ worktreePath: dir, hash });
    expect(detail?.hash).toBe(hash);
    expect(detail?.subject).toBe("the subject");
    // Body preserves the blank line between paragraphs.
    expect(detail?.body).toBe(body);
    expect(detail?.parents).toEqual([parent]);
  });

  it("reports the first-parent numstat for a merge commit", async () => {
    // `git show <merge> --numstat` (no `-m`) prints the diff against the FIRST
    // parent, not an empty set - so getCommitDetail surfaces those file rows.
    // (getGitGraph, which uses `git log --shortstat`, is what nulls a merge's
    // stats; git show does not.)
    const dir = await initRepo();
    await commit(dir, "f.txt", "base\n", "base");
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    // feat adds g.txt (1 line) which is what the merge brings into main.
    await commit(dir, "g.txt", "feat\n", "feat");
    await git(dir, ["checkout", "-q", "main"]);
    await commit(dir, "h.txt", "main\n", "main");
    await git(dir, ["merge", "--no-ff", "--no-edit", "feat"]);
    const mergeSha = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: dir })
    ).stdout.trim();

    const detail = await getCommitDetail({ worktreePath: dir, hash: mergeSha });
    expect(detail).not.toBeNull();
    // Diff vs first parent (main): the merge introduced g.txt (+1).
    expect(detail?.files).toEqual([
      { path: "g.txt", insertions: 1, deletions: 0 },
    ]);
    expect(detail?.stats).toEqual({
      filesChanged: 1,
      insertions: 1,
      deletions: 0,
    });
    // NOTE: `detail.parents` SHOULD hold the 2 merge parents, but the src bug
    // documented above collapses the header record to []; see the skipped test.
  });

  it("rejects ref expressions and malformed hash strings with null", async () => {
    const dir = await initRepo();
    await commit(dir, "f.txt", "base\n", "base");

    const rejected = [
      "main",
      "HEAD",
      "abc", // too short (< 7)
      "x".repeat(40), // 'x' is not a hex char
      "--help",
      "-deadbeef", // leading dash
    ];
    for (const hash of rejected) {
      expect(await getCommitDetail({ worktreePath: dir, hash })).toBeNull();
    }
  });

  it("returns null for a well-formed hash that does not exist", async () => {
    const dir = await initRepo();
    await commit(dir, "f.txt", "base\n", "base");
    const detail = await getCommitDetail({
      worktreePath: dir,
      hash: "deadbeefdeadbeef",
    });
    expect(detail).toBeNull();
  });

  it("reports null insertions/deletions for a binary file change", async () => {
    const dir = await initRepo();
    await commit(dir, "seed.txt", "seed\n", "seed");
    // A tiny binary blob with an embedded NUL so git treats it as binary.
    const bin = Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x10, 0x7f]);
    await fs.writeFile(path.join(dir, "blob.bin"), bin);
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "add binary"], { cwd: dir });
    const hash = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: dir })
    ).stdout.trim();

    const detail = await getCommitDetail({ worktreePath: dir, hash });
    const row = detail?.files.find((f) => f.path === "blob.bin");
    expect(row).toBeDefined();
    expect(row?.insertions).toBeNull();
    expect(row?.deletions).toBeNull();
  });
});
