import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { runInit } from "../src/project/init-template.js";
import { discoverFlowCatalog } from "../src/flows/catalog/flow-discovery.js";

/**
 * Two first-contact defects the Deskly benchmark exposed (2026-08-22).
 *
 * Both bit a NEW user on their first run, which is the worst possible place:
 * a config file they did not write, failing before anything of theirs ran.
 */
async function repo(branch: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-init-"));
  await execa("git", ["init", "-q", "-b", branch], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), "{}");
  await execa("git", ["add", "-A"], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "i"], { cwd: dir });
  return dir;
}

describe("init writes the repo's real default branch", () => {
  it("scaffolds mainBranch: master on a master repo", async () => {
    // The template hardcoded `main`, so on a `master` repo every run died at
    // worktree creation with `fatal: invalid reference: main` - the first run
    // a new user ever starts.
    const dir = await repo("master");
    await runInit({ projectRoot: dir });
    const yml = await fs.readFile(path.join(dir, ".vibestrate", "project.yml"), "utf8");
    expect(yml).toContain('mainBranch: "master"');
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("still writes main on a main repo", async () => {
    const dir = await repo("main");
    await runInit({ projectRoot: dir });
    const yml = await fs.readFile(path.join(dir, ".vibestrate", "project.yml"), "utf8");
    expect(yml).toContain('mainBranch: "main"');
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);
});

describe("a flat flow yml is reported, not swallowed", () => {
  it("names the file and the move that fixes it", async () => {
    // `.vibestrate/flows/<id>.yml` is the shape everyone writes first, and it
    // used to be skipped without a word - the flow never appeared and nothing
    // said why.
    const dir = await repo("main");
    await fs.mkdir(path.join(dir, ".vibestrate", "flows"), { recursive: true });
    await fs.writeFile(path.join(dir, ".vibestrate", "flows", "myflow.yml"), "id: myflow\n");
    const catalog = await discoverFlowCatalog(dir);
    const flagged = catalog.invalid.find((i) => i.path.endsWith("myflow.yml"));
    expect(flagged, "the flat yml was silently ignored again").toBeTruthy();
    expect(flagged?.message).toContain("myflow/flow.yml");
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("does not flag unrelated files in the directory", async () => {
    const dir = await repo("main");
    await fs.mkdir(path.join(dir, ".vibestrate", "flows"), { recursive: true });
    await fs.writeFile(path.join(dir, ".vibestrate", "flows", "README.md"), "# notes\n");
    const catalog = await discoverFlowCatalog(dir);
    expect(catalog.invalid.find((i) => i.path.endsWith("README.md"))).toBeUndefined();
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);
});
