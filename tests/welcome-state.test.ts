import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  WELCOME_STEP_ORDER,
  emptyWelcomeState,
  firstIncompleteStep,
  isWelcomeComplete,
  loadWelcomeState,
  recordWelcomeStep,
  resetWelcomeState,
  withStepResult,
} from "../src/cli/welcome/welcome-state.js";
import { welcomeStatePath } from "../src/utils/paths.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-welcome-"));
}

describe("welcome walkthrough sequencing", () => {
  it("orders steps providers -> crew -> flows -> first-run", () => {
    expect(WELCOME_STEP_ORDER).toEqual(["providers", "crew", "flows", "first-run"]);
  });

  it("a fresh state resumes at the first step", () => {
    expect(firstIncompleteStep(emptyWelcomeState())).toBe("providers");
    expect(isWelcomeComplete(emptyWelcomeState())).toBe(false);
  });

  it("resume starts at the first step with no recorded result", () => {
    const state = withStepResult(
      withStepResult(emptyWelcomeState(), "providers", "done"),
      "crew",
      "skipped",
    );
    expect(firstIncompleteStep(state)).toBe("flows");
  });

  it("completing every step in order clears the resume point", () => {
    let state = emptyWelcomeState();
    for (const id of WELCOME_STEP_ORDER) {
      state = withStepResult(state, id, "done");
    }
    expect(firstIncompleteStep(state)).toBeNull();
    expect(isWelcomeComplete(state)).toBe(true);
  });
});

describe("welcome state persistence", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("loadWelcomeState returns fresh state when no file exists", async () => {
    const state = await loadWelcomeState(projectRoot);
    expect(state).toEqual(emptyWelcomeState());
  });

  it("skip records progress that a reload picks up", async () => {
    const initial = await loadWelcomeState(projectRoot);
    const next = await recordWelcomeStep(projectRoot, initial, "providers", "skipped");
    expect(next.steps.providers).toBe("skipped");

    const reloaded = await loadWelcomeState(projectRoot);
    expect(reloaded.steps.providers).toBe("skipped");
    expect(firstIncompleteStep(reloaded)).toBe("crew");
  });

  it("done and skipped steps both advance the resume point across reloads", async () => {
    let state = await loadWelcomeState(projectRoot);
    state = await recordWelcomeStep(projectRoot, state, "providers", "done");
    state = await recordWelcomeStep(projectRoot, state, "crew", "skipped");

    const reloaded = await loadWelcomeState(projectRoot);
    expect(firstIncompleteStep(reloaded)).toBe("flows");
  });

  it("--reset clears saved progress back to fresh", async () => {
    let state = await loadWelcomeState(projectRoot);
    state = await recordWelcomeStep(projectRoot, state, "providers", "done");
    state = await recordWelcomeStep(projectRoot, state, "crew", "done");
    expect(firstIncompleteStep(await loadWelcomeState(projectRoot))).toBe("flows");

    const reset = await resetWelcomeState(projectRoot);
    expect(reset).toEqual(emptyWelcomeState());

    const reloaded = await loadWelcomeState(projectRoot);
    expect(reloaded).toEqual(emptyWelcomeState());
    await expect(fs.access(welcomeStatePath(projectRoot))).rejects.toThrow();
  });

  it("a corrupt state file is treated as fresh, not a crash", async () => {
    const file = welcomeStatePath(projectRoot);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{ not valid json at all", "utf8");

    const state = await loadWelcomeState(projectRoot);
    expect(state).toEqual(emptyWelcomeState());
  });

  it("a well-formed-JSON-but-wrong-shape state file is treated as fresh", async () => {
    const file = welcomeStatePath(projectRoot);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 2, foo: "bar" }), "utf8");

    const state = await loadWelcomeState(projectRoot);
    expect(state).toEqual(emptyWelcomeState());
  });

  it("an unknown step id in the file is dropped rather than wedging sequencing", async () => {
    const file = welcomeStatePath(projectRoot);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        steps: { providers: "done", "some-future-step": "done" },
        updatedAt: null,
      }),
      "utf8",
    );

    const state = await loadWelcomeState(projectRoot);
    expect(state.steps).toEqual({ providers: "done" });
    expect(firstIncompleteStep(state)).toBe("crew");
  });
});
