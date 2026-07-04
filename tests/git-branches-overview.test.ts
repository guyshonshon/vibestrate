import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { getBranchesOverview } from "../src/core/git-history-service.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});

async function initRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-branches-"));
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

const byName = (o: Awaited<ReturnType<typeof getBranchesOverview>>) =>
  new Map(o.branches.map((b) => [b.name, b]));

describe("getBranchesOverview", () => {
  it("reports ahead/behind, own diffstat, and populated meta for a branch 2 ahead / 0 behind", async () => {
    const dir = await initRepo();
    // main root: one file, 1 line.
    await commit(dir, "base.txt", "base\n", "base");

    // feat forks from main and adds two commits on top of it.
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    // Commit 1 on feat: new file with 3 lines -> +3.
    await commit(dir, "a.txt", "l1\nl2\nl3\n", "feat one");
    // Commit 2 on feat: new file with 2 lines -> +2.  Total branch diff vs
    // merge-base = 5 insertions, 0 deletions, 2 files.
    await commit(dir, "b.txt", "l4\nl5\n", "feat two");
    await git(dir, ["checkout", "-q", "main"]);

    const overview = await getBranchesOverview({
      worktreePath: dir,
      mainBranch: "main",
    });
    expect(overview.available).toBe(true);
    expect(overview.mainBranch).toBe("main");

    const map = byName(overview);
    const feat = map.get("feat");
    expect(feat).toBeDefined();
    expect(feat?.isMain).toBe(false);
    expect(feat?.mergedIntoMain).toBe(false);
    expect(feat?.ahead).toBe(2);
    expect(feat?.behind).toBe(0);
    // Diff of the branch vs its merge-base with main.
    expect(feat?.stats).toEqual({
      filesChanged: 2,
      insertions: 5,
      deletions: 0,
    });
    expect(feat?.subject).toBe("feat two");
    expect(feat?.author).toBe("x");

    const main = map.get("main");
    expect(main?.isMain).toBe(true);
    expect(main?.ahead).toBe(0);
    expect(main?.behind).toBe(0);
    // main has no ahead/behind or diffstat vs itself.
    expect(main?.stats).toBeNull();
  });

  it("flags a branch merged into main (--no-ff, not deleted) as mergedIntoMain", async () => {
    const dir = await initRepo();
    await commit(dir, "base.txt", "base\n", "base");

    await git(dir, ["checkout", "-q", "-b", "merged-branch"]);
    await commit(dir, "m.txt", "merged\n", "merged work");
    await git(dir, ["checkout", "-q", "main"]);
    await git(dir, ["merge", "--no-ff", "--no-edit", "merged-branch"]);

    const overview = await getBranchesOverview({
      worktreePath: dir,
      mainBranch: "main",
    });
    const map = byName(overview);
    expect(map.get("merged-branch")?.mergedIntoMain).toBe(true);
    // Fully merged: every branch commit is on main, so ahead is 0.
    expect(map.get("merged-branch")?.ahead).toBe(0);
    // main itself is never flagged merged-into-itself.
    expect(map.get("main")?.mergedIntoMain).toBe(false);
  });

  it("reports both ahead and behind with the correct left/right orientation", async () => {
    const dir = await initRepo();
    await commit(dir, "base.txt", "base\n", "base");

    // feat forks here and gets 1 unique commit (ahead = 1).
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    await commit(dir, "f.txt", "feat\n", "feat only");

    // main then advances with 2 unique commits AFTER the fork (behind = 2).
    await git(dir, ["checkout", "-q", "main"]);
    await commit(dir, "m1.txt", "m1\n", "main one");
    await commit(dir, "m2.txt", "m2\n", "main two");

    const overview = await getBranchesOverview({
      worktreePath: dir,
      mainBranch: "main",
    });
    const feat = byName(overview).get("feat");
    // ahead = commits on branch not on main (the single "feat only").
    expect(feat?.ahead).toBe(1);
    // behind = commits on main not on branch (the two "main one/two").
    expect(feat?.behind).toBe(2);
  });

  it("stays available with zeroed ahead/behind and null stats when mainBranch is absent", async () => {
    const dir = await initRepo();
    await commit(dir, "base.txt", "base\n", "base");
    await git(dir, ["checkout", "-q", "-b", "feat"]);
    await commit(dir, "g.txt", "feat\n", "feat");
    await git(dir, ["checkout", "-q", "main"]);

    // Repo has "main" + "feat" but config points at a non-existent "trunk".
    const overview = await getBranchesOverview({
      worktreePath: dir,
      mainBranch: "trunk",
    });
    expect(overview.available).toBe(true);
    expect(overview.mainBranch).toBe("trunk");
    expect(overview.branches.length).toBeGreaterThan(0);
    // Nothing can be measured against a missing main -> all neutral.
    for (const b of overview.branches) {
      expect(b.isMain).toBe(false);
      expect(b.ahead).toBe(0);
      expect(b.behind).toBe(0);
      expect(b.stats).toBeNull();
      expect(b.mergedIntoMain).toBe(false);
    }
  });

  it("keeps columns aligned and the subject intact when the subject contains a TAB", async () => {
    const dir = await initRepo();
    await commit(dir, "base.txt", "base\n", "base");

    await git(dir, ["checkout", "-q", "-b", "feat"]);
    // A commit subject that itself contains a literal tab. for-each-ref emits
    // TAB-separated columns with the subject LAST; the parser must rejoin the
    // trailing columns so the tab lands in the subject, not shift name/hash/date.
    const subject = "col-a\tcol-b after tab";
    await fs.writeFile(path.join(dir, "t.txt"), "x\n");
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", subject], { cwd: dir });
    const featHash = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: dir })
    ).stdout.trim();
    await git(dir, ["checkout", "-q", "main"]);

    const overview = await getBranchesOverview({
      worktreePath: dir,
      mainBranch: "main",
    });
    const feat = byName(overview).get("feat");
    expect(feat).toBeDefined();
    // Columns before the subject are untouched by the embedded tab.
    expect(feat?.name).toBe("feat");
    expect(feat?.hash).toBe(featHash);
    expect(feat?.shortHash).toBe(featHash.slice(0, feat!.shortHash.length));
    expect(featHash.startsWith(feat!.shortHash)).toBe(true);
    // ISO-8601-ish date column survived (not swallowed into the subject).
    expect(feat?.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The full subject, tab and all, is preserved.
    expect(feat?.subject).toBe(subject);
  });

  it("returns unavailable for a non-git path", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-nogit-"));
    dirs.push(dir);
    const overview = await getBranchesOverview({
      worktreePath: dir,
      mainBranch: "main",
    });
    expect(overview.available).toBe(false);
    expect(overview.branches).toEqual([]);
  });
});
