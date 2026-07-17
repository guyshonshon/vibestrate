import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runWelcomeCommand } from "../src/cli/commands/welcome.js";
import { welcomeStatePath } from "../src/utils/paths.js";
import { pathExists } from "../src/utils/fs.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-welcome-cmd-"));
}

// `vibe welcome` is interactive-only; the vitest process itself is never a
// TTY, so runWelcomeCommand always takes the non-interactive branch here.
// That is exactly the behavior under test: a headless invocation must exit
// cleanly and touch nothing in the project.
describe("vibe welcome (non-TTY)", () => {
  let projectRoot: string;
  let prevCwd: string;

  beforeEach(async () => {
    projectRoot = await tempProject();
    prevCwd = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(() => {
    process.chdir(prevCwd);
  });

  it("exits 0 with a plain message and writes nothing in an uninitialized project", async () => {
    const code = await runWelcomeCommand({});
    expect(code).toBe(0);
    expect(await pathExists(path.join(projectRoot, ".vibestrate"))).toBe(false);
  });

  it("exits 0 without touching welcome-state.json in an initialized project", async () => {
    await fs.mkdir(path.join(projectRoot, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, ".vibestrate", "project.yml"), "");

    const code = await runWelcomeCommand({});
    expect(code).toBe(0);
    expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
  });

  it("--reset does not write on a non-TTY run either", async () => {
    await fs.mkdir(path.join(projectRoot, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, ".vibestrate", "project.yml"), "");

    const code = await runWelcomeCommand({ reset: true });
    expect(code).toBe(0);
    expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
  });
});
