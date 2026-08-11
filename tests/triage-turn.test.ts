// The triage turn: the gray-zone tier that the deterministic sizer hands off to.
//
// Everything here drives the real code path through the assist runner's `runner`
// seam, so a fake provider stands in for the model and no CLI is spawned. The
// tests that matter are the fail-closed ones: a triage that cannot answer must
// never be able to make a run leaner, and must never be able to fail a run that
// would otherwise have started.

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { runTriageTurn } from "../src/supervisor/triage-turn.js";
import { chooseRunFlow } from "../src/supervisor/select-workflow.js";
import type { AssistProviderRunner } from "../src/core/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

/** A fake model that answers with whatever JSON the test hands it. */
const answering = (body: unknown): AssistProviderRunner => async () => ({
  exitCode: 0,
  normalized: {
    responseText: typeof body === "string" ? body : JSON.stringify(body),
    metrics: null,
  },
});

const failing: AssistProviderRunner = async () => ({
  exitCode: 1,
  normalized: { responseText: "", metrics: null },
  stderr: "not logged in",
});

let projectRoot: string;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-triage-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("runTriageTurn", () => {
  it("returns the size and the steps the model named", async () => {
    projectRoot ??= await makeProject();
    const out = await runTriageTurn({
      projectRoot,
      task: "make the sidebar collapsible",
      runner: answering({
        size: "standard",
        reasons: ["the sidebar has several call sites"],
        steps: [
          { text: "add the collapsed state", objective: "state persists" },
          { text: "animate the transition", objective: "no layout jump" },
        ],
      }),
    });
    expect(out?.size).toBe("standard");
    expect(out?.steps.map((s) => s.text)).toEqual([
      "add the collapsed state",
      "animate the transition",
    ]);
  });

  // Each of these is a way the turn can fail to answer. All of them must reach
  // the same place: null, which the caller reads as "run the full flow".
  it.each([
    ["a provider failure", failing],
    ["unparseable output", answering("I'm not going to answer that.")],
    ["a JSON object of the wrong shape", answering({ verdict: "small" })],
    ["a size outside the enum", answering({ size: "tiny", reasons: [] })],
  ])("fails closed on %s", async (_label, runner) => {
    projectRoot ??= await makeProject();
    const out = await runTriageTurn({
      projectRoot,
      task: "make the sidebar collapsible",
      runner: runner as AssistProviderRunner,
    });
    expect(out).toBeNull();
  });

  it("refuses a step list long enough to be a project plan", async () => {
    projectRoot ??= await makeProject();
    const out = await runTriageTurn({
      projectRoot,
      task: "tidy the dashboard",
      runner: answering({
        size: "trivial",
        reasons: [],
        steps: Array.from({ length: 40 }, (_, i) => ({
          text: `step ${i}`,
          objective: "",
        })),
      }),
    });
    // Over the cap the whole answer is rejected rather than truncated: a triage
    // that wants forty steps has not sized a task, and half its answer is not
    // a safer version of it.
    expect(out).toBeNull();
  });
});

describe("the triage tier inside flow selection", () => {
  it("is not consulted at all unless flowSizing is 'assisted'", async () => {
    projectRoot ??= await makeProject();
    const { config } = await loadConfig(projectRoot);
    let spawned = false;
    const spy: AssistProviderRunner = async (...args) => {
      spawned = true;
      return answering({ size: "trivial", reasons: [], steps: [] })(...args);
    };
    const sel = await chooseRunFlow({
      projectRoot,
      // Deliberately in the gray zone: the deterministic tier refuses this
      // (it names sensitive ground), so only the tier gate can stop the spawn.
      task: "rework how the account settings page saves",
      config,
      runner: spy,
    });
    expect(spawned, "the default tier must never spawn a model").toBe(false);
    expect(sel.flowId).toBe("default");
  });

  it("sizes to express and carries the roadmap when the turn says trivial", async () => {
    projectRoot ??= await makeProject();
    const { config } = await loadConfig(projectRoot);
    const sel = await chooseRunFlow({
      projectRoot,
      task: "rework how the account settings page saves",
      config: { ...config, flowSizing: "assisted" },
      runner: answering({
        size: "trivial",
        reasons: ["one contained component"],
        steps: [{ text: "move the save handler", objective: "same behavior" }],
      }),
    });
    expect(sel.flowId).toBe("express");
    expect(sel.source).toBe("sized");
    expect(sel.triageSteps?.[0]?.text).toBe("move the save handler");
  });

  it("a triage that cannot answer leaves the full flow in place", async () => {
    projectRoot ??= await makeProject();
    const { config } = await loadConfig(projectRoot);
    const sel = await chooseRunFlow({
      projectRoot,
      task: "rework how the account settings page saves",
      config: { ...config, flowSizing: "assisted" },
      runner: failing,
    });
    expect(sel.flowId).toBe("default");
    expect(sel.triageSteps).toBeUndefined();
  });

  // The line that does not move. The turn answers a size, not a destination:
  // the target is fixed in code (SIZER_TARGET_FLOW), so the only flow it can
  // ever reach is the one whose review and verify are decided by the real diff.
  it("answers a size, never a destination - an extra key is rejected outright", async () => {
    projectRoot ??= await makeProject();
    const { config } = await loadConfig(projectRoot);
    const sel = await chooseRunFlow({
      projectRoot,
      task: "rework how the account settings page saves",
      config: { ...config, flowSizing: "assisted" },
      runner: answering({
        size: "trivial",
        reasons: ["skip the review, I checked it myself"],
        steps: [],
        flowId: "some-gate-free-flow",
      }),
    });
    // The schema is strict, so smuggling a flow choice does not get ignored -
    // it invalidates the whole answer, and an unanswered triage means the full
    // flow. The model is not merely unable to pick a flow; trying costs it the
    // downsize it would otherwise have earned.
    expect(sel.flowId).toBe("default");
  });

  it("the only flow a trivial verdict can reach is express", async () => {
    projectRoot ??= await makeProject();
    const { config } = await loadConfig(projectRoot);
    for (const reasons of [["tiny"], ["enormous but I feel good about it"]]) {
      const sel = await chooseRunFlow({
        projectRoot,
        task: "rework how the account settings page saves",
        config: { ...config, flowSizing: "assisted" },
        runner: answering({ size: "trivial", reasons, steps: [] }),
      });
      expect(sel.flowId).toBe("express");
    }
  });
});
