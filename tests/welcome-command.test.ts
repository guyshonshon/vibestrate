import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runWelcomeCommand } from "../src/cli/commands/welcome.js";
import { welcomeStatePath } from "../src/utils/paths.js";
import { pathExists } from "../src/utils/fs.js";
import {
  firstIncompleteStep,
  loadWelcomeState,
  recordWelcomeStep,
} from "../src/cli/welcome/welcome-state.js";

// `runWelcomeCommand` drives @inquirer/prompts and `runProviderSetup`
// directly, so the interactive tests below mock both instead of relying on
// runProviderSetup's own non-TTY guard - that guard can never fire from
// inside runWelcomeCommand in production, since runWelcomeCommand already
// gated on isInteractiveTTY() before either module is reached.
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
}));

vi.mock("../src/cli/commands/provider/setup.js", () => ({
  runProviderSetup: vi.fn(),
}));

vi.mock("../src/setup/config-update-service.js", () => ({
  listCrewPresets: vi.fn(),
  installCrewPreset: vi.fn(),
}));

const { select } = await import("@inquirer/prompts");
const { runProviderSetup } = await import("../src/cli/commands/provider/setup.js");
const { listCrewPresets } = await import("../src/setup/config-update-service.js");

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-welcome-cmd-"));
}

async function initProject(projectRoot: string): Promise<void> {
  await fs.mkdir(path.join(projectRoot, ".vibestrate"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, ".vibestrate", "project.yml"), "");
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
    await initProject(projectRoot);

    const code = await runWelcomeCommand({});
    expect(code).toBe(0);
    expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
  });

  it("--reset does not write on a non-TTY run either", async () => {
    await initProject(projectRoot);

    const code = await runWelcomeCommand({ reset: true });
    expect(code).toBe(0);
    expect(await pathExists(welcomeStatePath(projectRoot))).toBe(false);
  });
});

// These tests force process.stdin/stdout.isTTY so runWelcomeCommand takes its
// real interactive branch and drives the actual step loop end to end -
// @inquirer/prompts, runProviderSetup, and listCrewPresets are mocked, but
// runWelcomeCommand's own control flow (resume point, replay guard, closing
// message) is exercised for real, not re-implemented inside the test.
describe("vibe welcome (interactive loop)", () => {
  let projectRoot: string;
  let prevCwd: string;
  let prevStdinTTY: boolean | undefined;
  let prevStdoutTTY: boolean | undefined;

  beforeEach(async () => {
    projectRoot = await tempProject();
    prevCwd = process.cwd();
    process.chdir(projectRoot);
    await initProject(projectRoot);

    prevStdinTTY = process.stdin.isTTY;
    prevStdoutTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

    vi.mocked(select).mockResolvedValue("continue");
    vi.mocked(listCrewPresets).mockResolvedValue([]);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    Object.defineProperty(process.stdin, "isTTY", { value: prevStdinTTY, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: prevStdoutTTY, configurable: true });
    vi.clearAllMocks();
  });

  // Finding 1 (mutation-checked): a step whose own wizard fails must not be
  // recorded as "done". Reintroducing `recordWelcomeStep(..., "done")`
  // unconditionally in welcome.ts makes this test fail - see the round 2
  // report for the observed failure.
  it("a failed providers step is left unrecorded and stays the resume point", async () => {
    vi.mocked(runProviderSetup).mockResolvedValue(1);

    const code = await runWelcomeCommand({});
    expect(code).toBe(0);

    const state = await loadWelcomeState(projectRoot);
    expect(state.steps.providers).toBeUndefined();
    expect(firstIncompleteStep(state)).toBe("providers");
  });

  // Finding 3: the closing report must not claim completion while a step is
  // still unrecorded from this same run.
  it("the closing message names the still-pending step instead of claiming completion", async () => {
    vi.mocked(runProviderSetup).mockResolvedValue(1);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runWelcomeCommand({});

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((l) => l.includes("Walkthrough complete."))).toBe(false);
    expect(lines.some((l) => l.includes("still needs a pass"))).toBe(true);
    expect(lines.some((l) => l.includes("Providers"))).toBe(true);
  });

  it("a fully successful run reports completion cleanly", async () => {
    vi.mocked(runProviderSetup).mockResolvedValue(0);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await runWelcomeCommand({});
    expect(code).toBe(0);

    const state = await loadWelcomeState(projectRoot);
    expect(firstIncompleteStep(state)).toBeNull();

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((l) => l.includes("Walkthrough complete."))).toBe(true);
    expect(lines.some((l) => l.includes("still needs a pass"))).toBe(false);
  });

  // Finding 2: resuming at an earlier hole must not replay later steps the
  // state already records as done or skipped.
  it("resuming at an earlier failed step does not replay already-recorded later steps", async () => {
    let state = await loadWelcomeState(projectRoot);
    state = await recordWelcomeStep(projectRoot, state, "crew", "done");
    state = await recordWelcomeStep(projectRoot, state, "flows", "skipped");
    state = await recordWelcomeStep(projectRoot, state, "first-run", "done");
    // providers has no recorded result - it is the sole resume point, with
    // crew/flows/first-run already settled from an earlier interrupted run.
    expect(firstIncompleteStep(state)).toBe("providers");

    vi.mocked(runProviderSetup).mockResolvedValue(0);

    const code = await runWelcomeCommand({});
    expect(code).toBe(0);

    // If crew/flows/first-run were replayed, the loop would prompt (select)
    // for each of them too, on top of the one prompt for providers.
    expect(vi.mocked(select)).toHaveBeenCalledTimes(1);
    // listCrewPresets is only ever called from inside the crew step's own
    // logic - it must not run again once crew is already recorded as done.
    expect(vi.mocked(listCrewPresets)).not.toHaveBeenCalled();

    const finalState = await loadWelcomeState(projectRoot);
    expect(finalState.steps.providers).toBe("done");
    expect(finalState.steps.crew).toBe("done");
    expect(finalState.steps.flows).toBe("skipped");
    expect(finalState.steps["first-run"]).toBe("done");
    expect(firstIncompleteStep(finalState)).toBeNull();
  });
});
