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

  /**
   * The prompts have to REACH the published package - that is the invariant,
   * not the path they take. They used to ship as `src/agents/default-prompts`,
   * which put a source path inside a package that ships no source; the build
   * now copies them into `dist/`, which `files` already covers.
   *
   * Asserting the copy step rather than a `files` entry is what keeps this
   * honest: dropping `onSuccess` from tsup.config.ts would otherwise publish a
   * package whose every run fails to find a role prompt.
   */
  it("the build copies the prompts somewhere the package actually ships", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      files: string[];
    };
    const tsup = await fs.readFile(path.join(repoRoot, "tsup.config.ts"), "utf8");
    expect(tsup, "the build must copy the prompts into dist/").toMatch(
      /dist\/default-prompts/,
    );
    expect(pkg.files, "dist/ must be published for the copy to reach anyone").toContain(
      "dist",
    );
    // And the source they are copied FROM still has to exist.
    const src = path.join(repoRoot, "src", "agents", "default-prompts");
    await expect(fs.stat(src)).resolves.toBeTruthy();
  });
});
