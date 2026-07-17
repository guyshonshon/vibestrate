import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runWelcomeCommand, runStep, stepSucceeded } from "../src/cli/commands/welcome.js";
import { welcomeStatePath } from "../src/utils/paths.js";
import { pathExists } from "../src/utils/fs.js";
import { firstIncompleteStep, loadWelcomeState, recordWelcomeStep } from "../src/cli/welcome/welcome-state.js";

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

// `runStep("providers", ...)` calls the real `runProviderSetup`, which itself
// checks isInteractiveTTY() before touching any @inquirer prompt (see
// src/cli/commands/provider/setup.ts). The vitest process is never a TTY, so
// this exercises runProviderSetup's genuine non-interactive failure path -
// no prompt mocking required - and proves the walkthrough's call site
// (welcome.ts) would see a non-zero code from a failed provider step.
describe("vibe welcome - failed provider step stays resumable", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await tempProject();
    await fs.mkdir(path.join(projectRoot, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, ".vibestrate", "project.yml"), "");
  });

  it("runStep returns a non-zero code for providers when not run interactively", async () => {
    const code = await runStep("providers", projectRoot);
    expect(code).not.toBe(0);
  });

  it("a non-zero step code must not be recorded as done, and the resume point stays at providers", async () => {
    const initial = await loadWelcomeState(projectRoot);
    const stepCode = await runStep("providers", projectRoot);
    expect(stepCode).not.toBe(0);

    // Uses the same `stepSucceeded` gate runWelcomeCommand's loop calls, applied
    // to the real (non-mocked) stepCode above - this is what proves finding 1
    // without mocking @inquirer prompts.
    let state = initial;
    if (stepSucceeded(stepCode)) {
      state = await recordWelcomeStep(projectRoot, state, "providers", "done");
    }

    expect(state.steps.providers).toBeUndefined();
    expect(firstIncompleteStep(state)).toBe("providers");
    expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
  });
});
