import { describe, it, expect } from "vitest";
import {
  classifyObviousTrivial,
  classifyPlanWorthy,
  SIZER_TARGET_FLOW,
  SPEC_UP_TARGET_FLOW,
} from "../src/supervisor/flow-sizing.js";
import { chooseRunFlow } from "../src/supervisor/select-workflow.js";
import { loadConfig } from "../src/project/config-loader.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execa } from "execa";

describe("classifyObviousTrivial (deterministic tier)", () => {
  it("sizes a short prose-file task as trivial", () => {
    expect(classifyObviousTrivial("make a simple test.txt file").trivial).toBe(true);
    expect(classifyObviousTrivial("fix a typo in README.md").trivial).toBe(true);
  });

  it("never sizes a task naming code/config files", () => {
    expect(classifyObviousTrivial("tweak src/auth/login.ts").trivial).toBe(false);
    expect(
      classifyObviousTrivial("update README.md and package.json").trivial,
    ).toBe(false);
    expect(classifyObviousTrivial("edit deploy.yml quickly").trivial).toBe(false);
  });

  it("never sizes without a concrete file (no task-text guessing)", () => {
    expect(classifyObviousTrivial("refactor the scheduler").trivial).toBe(false);
    expect(classifyObviousTrivial("").trivial).toBe(false);
  });

  it("never sizes long/wordy tasks", () => {
    expect(classifyObviousTrivial(`update notes.md ${"and also ".repeat(40)}`).trivial).toBe(false);
  });
});

describe("classifyPlanWorthy (the adaptive spec-up trigger)", () => {
  // The corpus the Tier-2 review required: must fire on greenfield/system briefs
  // (the flagship "build a mini ecommerce store" especially) and stay OFF
  // targeted edits / trivial work.
  it("FIRES on greenfield / system-build briefs", () => {
    for (const t of [
      "build a mini ecommerce store",
      "create a SaaS dashboard for analytics",
      "design a CRM system for a small sales team",
      "I want a marketplace from scratch",
      "build a real-time chat feature with websockets and message persistence and presence",
      "make a landing page and a backend API for signups",
    ]) {
      expect(classifyPlanWorthy(t).planWorthy, t).toBe(true);
    }
  });

  it("does NOT fire on targeted edits, trivial work, or non-build asks (bias to execute)", () => {
    for (const t of [
      "add a comment to foo.ts",
      "fix the failing test in auth.ts",
      "add dark mode toggle to the navbar",
      "build a button component",
      "rename getUser to fetchUser",
      "update the readme",
      "implement password reset via email",
      "migrate the database from sqlite to postgres",
      "bump the dependency version",
      // verb+noun collisions that are tweaks, not greenfield builds (Tier-2 #2):
      "make the API faster",
      "build a tool",
      "make the dashboard load faster and also tidy up the header",
    ]) {
      expect(classifyPlanWorthy(t).planWorthy, t).toBe(false);
    }
  });

  it("a named code file always means execute, even with build words", () => {
    expect(classifyPlanWorthy("build a new store module in src/store/index.ts").planWorthy).toBe(false);
  });
});

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(extraYml?: (yml: string) => string): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sizing-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  if (extraYml) {
    const p = path.join(project, ".vibestrate/project.yml");
    await fs.writeFile(p, extraYml(await fs.readFile(p, "utf8")));
  }
  return project;
}

describe("chooseRunFlow + sizing (A1)", () => {
  it("routes an obvious-trivial task to express, recorded as sized", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      loaded,
    });
    expect(sel.flowId).toBe(SIZER_TARGET_FLOW);
    expect(sel.source).toBe("sized");
    expect(sel.reasons.join(" ")).toMatch(/diff-decided/);
  });

  it("P1: a plan-worthy brief is marked needsSpecUp but keeps the chosen (default) flow, NOT spec-up-intake", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
    });
    // Spec-up is now an ORTHOGONAL enrichment: the flow is the chosen/default flow,
    // never replaced by a spec-up flow. The run runs spec-up first, then this flow runs.
    expect(sel.flowId).not.toBe(SPEC_UP_TARGET_FLOW);
    expect(sel.flowId).toBe("default");
    expect(sel.needsSpecUp).toBe(true);
  });

  it("P1 acceptance: --flow express + plan-worthy keeps express AND marks needsSpecUp", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    // The forced-flow short-circuit used to skip the spec-up decision entirely;
    // needsSpecUp is now layered onto every return path, so an explicit flow is
    // honored (never replaced) AND still runs spec-up first when the brief warrants it.
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
    });
    expect(sel.flowId).toBe("express");
    expect(sel.source).toBe("forced");
    expect(sel.needsSpecUp).toBe(true);
  });

  it("P1: a well-specified/targeted task skips spec-up (needsSpecUp false)", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "add a comment to src/store/index.ts",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
    });
    expect(sel.flowId).toBe("express");
    expect(sel.needsSpecUp).toBe(false);
  });

  it("adaptiveSpecUp: off suppresses spec-up entirely", async () => {
    const project = await makeProject((yml) => `${yml}\nadaptiveSpecUp: off\n`);
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
    });
    expect(sel.flowId).toBe("express");
    expect(sel.needsSpecUp).toBe(false);
  });

  it("the specUpPhase loop guard suppresses re-entry (a spec-up-phase/executor run)", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "build a mini ecommerce store",
      config: loaded.config,
      loaded,
      forcedFlowId: "express",
      specUpPhase: true,
    });
    expect(sel.flowId).toBe("express");
    expect(sel.needsSpecUp).toBe(false);
  });

  it("a risk-tagged trivial-looking task gets persona-upgraded past express", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "update auth.md with the new authentication secret rotation steps",
      config: loaded.config,
      loaded,
    });
    // Either the persona upgraded it away from express, or sizing refused -
    // both are acceptable; what's forbidden is landing on express via sizing.
    if (sel.flowId === SIZER_TARGET_FLOW) {
      expect(sel.source).not.toBe("sized");
    } else {
      expect(["supervisor-upgraded", "default"]).toContain(sel.source);
    }
  });

  it("flowSizing: off reproduces the default path exactly", async () => {
    const project = await makeProject((yml) => `${yml}\nflowSizing: off\n`);
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      loaded,
    });
    expect(sel.flowId).toBe("default");
    expect(sel.source).toBe("default");
  });

  it("an explicit defaultFlow always beats sizing", async () => {
    const project = await makeProject((yml) => `${yml}\ndefaultFlow: default\n`);
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      loaded,
    });
    expect(sel.flowId).toBe("default");
    expect(sel.source).toBe("default");
  });

  it("a forced flow always beats sizing", async () => {
    const project = await makeProject();
    const loaded = await loadConfig(project);
    const sel = await chooseRunFlow({
      projectRoot: project,
      task: "make a simple test.txt file",
      config: loaded.config,
      forcedFlowId: "panel-review",
      loaded,
    });
    expect(sel.flowId).toBe("panel-review");
    expect(sel.source).toBe("forced");
  });
});
