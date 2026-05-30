import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  stageAndCommitAll,
  hasChanges,
  currentHeadSha,
} from "../src/git/git.js";

async function tempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-gitc-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "seed.txt"), "seed");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

describe("git commit helpers", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempRepo();
  });

  it("hasChanges reflects the working tree", async () => {
    expect(await hasChanges(dir)).toBe(false);
    await fs.writeFile(path.join(dir, "new.txt"), "hello");
    expect(await hasChanges(dir)).toBe(true);
  });

  it("commits all changes and returns the new sha", async () => {
    const before = await currentHeadSha(dir);
    await fs.writeFile(path.join(dir, "a.ts"), "export const a = 1;");
    const res = await stageAndCommitAll({ cwd: dir, message: "add a" });
    expect(res).not.toBeNull();
    expect(res!.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(res!.sha).not.toBe(before);
    expect(await hasChanges(dir)).toBe(false);
  });

  it("returns null when there is nothing to commit", async () => {
    const res = await stageAndCommitAll({ cwd: dir, message: "noop" });
    expect(res).toBeNull();
  });

  it("stamps trailers (e.g. the checklist item id) on the commit", async () => {
    await fs.writeFile(path.join(dir, "b.ts"), "export const b = 2;");
    const res = await stageAndCommitAll({
      cwd: dir,
      message: "implement item",
      trailers: { "Vibestrate-Checklist-Item": "ci-xyz-1234" },
    });
    expect(res).not.toBeNull();
    const body = await execa("git", ["log", "-1", "--pretty=%B"], { cwd: dir });
    expect(body.stdout).toContain("Vibestrate-Checklist-Item: ci-xyz-1234");
  });
});
