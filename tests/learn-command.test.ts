import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { runLearn } from "../src/cli/commands/learn.js";
import { loadCodebaseMap, codebaseMapMarkdownPath } from "../src/project/codebase-map.js";

async function makeGitProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-learn-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo","scripts":{"test":"vitest"}}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

describe("runLearn", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeGitProject();
  });

  it("writes both artifacts and returns ok for a git project", async () => {
    const result = await runLearn(projectRoot, new Date().toISOString());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.markdownPath).toBe(codebaseMapMarkdownPath(projectRoot));
    expect(result.map.project.name).toBe("demo");
    expect(result.map.totalTrackedFiles).toBeGreaterThan(0);

    const markdown = await fs.readFile(codebaseMapMarkdownPath(projectRoot), "utf8");
    expect(markdown).toContain("Codebase map");

    const loaded = await loadCodebaseMap(projectRoot);
    expect(loaded.present).toBe(true);
  });

  it("re-running succeeds as a refresh", async () => {
    const first = await runLearn(projectRoot, new Date().toISOString());
    expect(first.ok).toBe(true);

    await fs.writeFile(path.join(projectRoot, "extra.ts"), "export const x = 1;\n");
    await execa("git", ["add", "."], { cwd: projectRoot });
    await execa("git", ["commit", "-q", "-m", "add extra"], { cwd: projectRoot });

    const second = await runLearn(projectRoot, new Date().toISOString());
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected ok");
    expect(second.map.entryPoints.length + second.map.totalTrackedFiles).toBeGreaterThan(0);
  });

  // Not a git repo, no package.json: writeCodebaseMap degrades honestly here
  // (empty layout/routes + a "not a git repository" note) rather than
  // throwing, so runLearn's real success path is "ok: true" with a note -
  // asserting that instead of an invented failure case.
  it("still succeeds (with a degradation note) on an empty non-git directory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-learn-empty-"));
    try {
      const result = await runLearn(dir, new Date().toISOString());
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok");
      expect(result.map.notes.some((n) => n.toLowerCase().includes("git repository"))).toBe(true);
      expect(result.map.totalTrackedFiles).toBe(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns a typed failure (never throws) when the project root cannot be written to", async () => {
    // A regular FILE where a directory is expected: mkdir(".vibestrate", {recursive:true})
    // under it hits ENOTDIR, a real fs failure runLearn must surface as `ok: false`.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-learn-blocked-"));
    const blockedRoot = path.join(dir, "not-a-directory");
    await fs.writeFile(blockedRoot, "not a directory");

    const result = await runLearn(blockedRoot, new Date().toISOString());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });
});
