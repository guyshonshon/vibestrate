import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  resolvePromptsDir,
  readDefaultPrompt,
  getBuiltinRoleIds,
} from "../src/agents/default-roles.js";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("default-prompts resolution", () => {
  it("finds the prompts from the bundled dist layout (the case that broke vibe init)", async () => {
    // Simulate an installed/bundled package: <pkg>/dist/index.js looking for
    // prompts that live at <pkg>/src/agents/default-prompts.
    const pkg = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-prompts-"));
    tmpDirs.push(pkg);
    const prompts = path.join(pkg, "src", "agents", "default-prompts");
    await fs.mkdir(prompts, { recursive: true });
    await fs.mkdir(path.join(pkg, "dist"), { recursive: true });
    await fs.writeFile(path.join(prompts, "planner.md"), "# planner");

    const { dir } = await resolvePromptsDir(path.join(pkg, "dist"));
    expect(dir).toBe(prompts);
  });

  it("reports the tried paths when nothing is found", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-empty-"));
    tmpDirs.push(empty);
    const { dir, tried } = await resolvePromptsDir(empty);
    expect(dir).toBeNull();
    expect(tried.length).toBeGreaterThan(0);
  });

  it("ships a prompt for every builtin role (guards a moved/renamed dir)", async () => {
    const dir = path.join(repoRoot, "src", "agents", "default-prompts");
    for (const roleId of getBuiltinRoleIds()) {
      const stat = await fs.stat(path.join(dir, `${roleId}.md`));
      expect(stat.isFile()).toBe(true);
    }
  });

  it("readDefaultPrompt returns non-empty content for a builtin role", async () => {
    const md = await readDefaultPrompt("planner");
    expect(md.trim().length).toBeGreaterThan(0);
  });

  it("package.json ships the prompts directory", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      files: string[];
    };
    expect(pkg.files).toContain("src/agents/default-prompts");
  });
});
