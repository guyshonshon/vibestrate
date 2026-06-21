import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { getGitGraph } from "../src/core/git-history-service.js";

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
