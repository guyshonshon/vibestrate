import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  selectWorkflow,
  chooseRunFlow,
  type AvailableFlow,
} from "../src/supervisor/select-workflow.js";
import {
  defaultFlow,
  qualityArbitrationFlow,
  pickupFlow,
} from "../src/flows/catalog/builtin-flows.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";
import type { ProjectConfig } from "../src/project/config-schema.js";
import type { AssistProviderRunner } from "../src/core/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-select-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

const FLOWS: AvailableFlow[] = [
  { id: "default", label: "Default", capabilities: null },
  { id: "quality-arbitration", label: "Quality Arbitration", capabilities: null },
];

function pickRunner(json: string): AssistProviderRunner {
  return async () => ({ exitCode: 0, normalized: { responseText: json, metrics: null } });
}

const throwRunner: AssistProviderRunner = async () => {
  throw new Error("runner must not be called on a fast path");
};

const cfg = (defaultFlow: string | null): ProjectConfig =>
  ({ defaultFlow }) as unknown as ProjectConfig;

describe("flow capabilities", () => {
  it("built-in flows declare capabilities", () => {
    expect(defaultFlow.capabilities?.costClass).toBe("medium");
    expect(qualityArbitrationFlow.capabilities?.strengths).toContain("security");
    expect(pickupFlow.capabilities?.taskKinds).toContain("checklist");
  });

  it("a flow without capabilities still parses (back-compat)", () => {
    const parsed = flowDefinitionSchema.parse({
      id: "bare",
      version: 1,
      label: "Bare",
      description: "no capabilities here",
      seats: { planner: { label: "Planner" } },
      steps: [{ id: "plan", label: "Plan", kind: "agent-turn", seat: "planner" }],
    });
    expect(parsed.capabilities).toBeUndefined();
  });
});

describe("selectWorkflow fast paths (no LLM)", () => {
  it("forced flow", async () => {
    const s = await selectWorkflow({
      projectRoot: "/nope",
      task: "x",
      forcedFlowId: "quality-arbitration",
      availableFlows: FLOWS,
      runner: throwRunner,
    });
    expect(s).toMatchObject({ flowId: "quality-arbitration", source: "forced" });
  });

  it("default flow when set and not forced to select", async () => {
    const s = await selectWorkflow({
      projectRoot: "/nope",
      task: "x",
      defaultFlowId: "default",
      availableFlows: FLOWS,
      runner: throwRunner,
    });
    expect(s.source).toBe("default");
  });

  it("only-flow when there is a single available flow", async () => {
    const s = await selectWorkflow({
      projectRoot: "/nope",
      task: "x",
      availableFlows: [FLOWS[0]!],
      runner: throwRunner,
    });
    expect(s.source).toBe("only-flow");
    expect(s.flowId).toBe("default");
  });
});

describe("selectWorkflow LLM branch", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await makeProject();
  });

  it("picks the flow the model returns", async () => {
    const s = await selectWorkflow({
      projectRoot,
      task: "Harden the auth crypto",
      availableFlows: FLOWS,
      runner: pickRunner(
        JSON.stringify({
          flowId: "quality-arbitration",
          confidence: "high",
          reasons: ["security-sensitive"],
          risks: ["auth path"],
          posture: "normal",
        }),
      ),
    });
    expect(s.source).toBe("selected");
    expect(s.flowId).toBe("quality-arbitration");
    expect(s.confidence).toBe("high");
  });

  it("applies a recommended crew when it exists, ignores an unknown one", async () => {
    const ok = await selectWorkflow({
      projectRoot,
      task: "x",
      availableFlows: FLOWS,
      availableCrews: [{ id: "default", label: "Default" }, { id: "review", label: "Review" }],
      runner: pickRunner(
        JSON.stringify({ flowId: "default", crewId: "review", confidence: "high", reasons: [], risks: [], posture: "normal" }),
      ),
    });
    expect(ok.crewId).toBe("review");

    const bad = await selectWorkflow({
      projectRoot,
      task: "x",
      availableFlows: FLOWS,
      availableCrews: [{ id: "default", label: "Default" }],
      runner: pickRunner(
        JSON.stringify({ flowId: "default", crewId: "ghost", confidence: "high", reasons: [], risks: [], posture: "normal" }),
      ),
    });
    expect(bad.crewId).toBeNull();
  });

  it("falls back and flags a risk when the model returns an unknown id", async () => {
    const s = await selectWorkflow({
      projectRoot,
      task: "x",
      defaultFlowId: "default",
      forceSelect: true,
      availableFlows: FLOWS,
      runner: pickRunner(
        JSON.stringify({ flowId: "does-not-exist", confidence: "low", reasons: [], risks: [], posture: "normal" }),
      ),
    });
    expect(s.flowId).toBe("default");
    expect(s.risks.some((r) => /unknown flow/i.test(r))).toBe(true);
  });
});

describe("chooseRunFlow precedence", () => {
  it("forced wins, no discovery/LLM", async () => {
    const s = await chooseRunFlow({
      projectRoot: "/nope",
      task: "x",
      config: cfg(null),
      forcedFlowId: "quality-arbitration",
      runner: throwRunner,
    });
    expect(s).toMatchObject({ flowId: "quality-arbitration", source: "forced" });
  });

  it("applies the configured default flow, no LLM", async () => {
    const s = await chooseRunFlow({
      projectRoot: "/nope",
      task: "x",
      config: cfg("quality-arbitration"),
      runner: throwRunner,
    });
    expect(s).toMatchObject({ flowId: "quality-arbitration", source: "default" });
  });

  it("a plain run uses the built-in default, no LLM", async () => {
    const s = await chooseRunFlow({
      projectRoot: "/nope",
      task: "x",
      config: cfg(null),
      runner: throwRunner,
    });
    expect(s).toMatchObject({ flowId: "default", source: "default" });
  });

  it("round-trips a configured defaultFlow into the choice (what `vibe flows use` does)", async () => {
    const projectRoot = await makeProject();
    const { setConfigValue } = await import("../src/setup/config-update-service.js");
    const { loadConfig } = await import("../src/project/config-loader.js");
    await setConfigValue(projectRoot, "defaultFlow", "quality-arbitration");
    const { config } = await loadConfig(projectRoot);
    expect(config.defaultFlow).toBe("quality-arbitration");
    const s = await chooseRunFlow({ projectRoot, task: "x", config, runner: throwRunner });
    expect(s).toMatchObject({ flowId: "quality-arbitration", source: "default" });
  });

  it("--select runs the orchestrator selection (LLM)", async () => {
    const projectRoot = await makeProject();
    const s = await chooseRunFlow({
      projectRoot,
      task: "Add GitHub OAuth",
      config: cfg(null),
      forceSelect: true,
      runner: pickRunner(
        JSON.stringify({ flowId: "default", confidence: "medium", reasons: ["app code only"], risks: [], posture: "normal" }),
      ),
    });
    expect(s.source).toBe("selected");
    expect(["default", "quality-arbitration", "pickup"]).toContain(s.flowId);
  });
});
