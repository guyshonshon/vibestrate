import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Reads stdin then exits 0 with NO stdout - a silent empty turn.
const EMPTY_PROVIDER = `#!/usr/bin/env node
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => { process.exit(0); });
`;

// Plan ok; reviewer prints output then exits non-zero (a real invocation failure).
const OK_THEN_FAIL_PROVIDER = `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const role = (prompt.match(/Vibestrate Agent: (\\w+)/) || [])[1] || "";
  if (role === "reviewer") { console.log("# Findings\\n\\nlooks ok"); process.exit(1); }
  console.log("# Plan\\n\\nSteps outlined.");
});
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pfh-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"pfh"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const write = async (name: string, body: string) => {
    const p = path.join(dir, name);
    await fs.writeFile(p, body, { mode: 0o755 });
    await fs.chmod(p, 0o755);
    return p;
  };
  const empty = await write("empty-provider.js", EMPTY_PROVIDER);
  const okFail = await write("okfail-provider.js", OK_THEN_FAIL_PROVIDER);
  const cli = (cmd: string, args: string[]) =>
    JSON.stringify({ type: "cli", command: cmd, args, input: "stdin" });
  await setConfigValue(dir, "providers.fake", cli("node", [okFail]));
  await setConfigValue(dir, "providers.empty", cli("node", [empty]));
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  await setConfigValue(dir, "profiles.empty-profile.provider", "empty");
  return dir;
}

async function readRunState(
  projectRoot: string,
): Promise<{ status: string; steps: { id: string; status: string }[] }> {
  const runsDir = path.join(projectRoot, ".vibestrate", "runs");
  const runId = (await fs.readdir(runsDir))[0]!;
  const raw = await fs.readFile(path.join(runsDir, runId, "state.json"), "utf8");
  const state = JSON.parse(raw);
  return {
    status: state.status,
    steps: (state.flow?.steps ?? []).map((s: { id: string; status: string }) => ({
      id: s.id,
      status: s.status,
    })),
  };
}

function makeOrchestrator(
  projectRoot: string,
  config: Awaited<ReturnType<typeof loadConfig>>["config"],
  rules: Awaited<ReturnType<typeof loadConfig>>["rules"],
  snapshot: ReturnType<typeof resolveFlow>,
) {
  return new Orchestrator({
    projectRoot,
    config,
    rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly: false,
    onProgress: () => {},
  });
}

describe("provider failure honesty (Slice 5 follow-up)", () => {
  it("linear: an empty-output turn fails the run (not a silent empty success)", async () => {
    const projectRoot = await makeRepo();
    const loaded = await loadConfig(projectRoot);
    const flow = flowDefinitionSchema.parse({
      id: "solo",
      version: 1,
      label: "Solo",
      description: "one planning turn",
      seats: { planner: { label: "Planner" } },
      steps: [
        { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
      ],
    });
    const snapshot = resolveFlow({
      flow,
      source: { kind: "fixture", ref: "solo" },
      config: loaded.config,
      task: "empty-output run",
      stepProfileOverrides: { plan: "empty-profile" },
    });
    const orch = makeOrchestrator(projectRoot, loaded.config, loaded.rules, snapshot);
    await expect(orch.run()).rejects.toThrow(/no output/i);

    const state = await readRunState(projectRoot);
    expect(state.status).toBe("failed");
    expect(state.steps.find((s) => s.id === "plan")?.status).toBe("failed");
  }, 60_000);

  it("graph: a required (non-best-effort) step failing fails the run, not merge_ready", async () => {
    const projectRoot = await makeRepo();
    const loaded = await loadConfig(projectRoot);
    // seed -> review (graph mode via needs); review is REQUIRED (no continueOnError)
    // and its provider exits non-zero, so the run must fail, not reach merge_ready.
    const flow = flowDefinitionSchema.parse({
      id: "g",
      version: 1,
      label: "G",
      description: "seed then a required review",
      seats: { planner: { label: "Planner" }, reviewer: { label: "Reviewer" } },
      steps: [
        { id: "seed", label: "Seed", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
        {
          id: "review",
          label: "Review",
          kind: "review-turn",
          seat: "reviewer",
          needs: ["seed"],
          inputs: ["plan"],
          outputs: ["review-decision"],
        },
      ],
    });
    const snapshot = resolveFlow({
      flow,
      source: { kind: "fixture", ref: "g" },
      config: loaded.config,
      task: "required failure run",
    });
    const orch = makeOrchestrator(projectRoot, loaded.config, loaded.rules, snapshot);
    await expect(orch.run()).rejects.toThrow(/review.*failed|provider exited 1/i);

    const state = await readRunState(projectRoot);
    expect(state.status).toBe("failed");
    expect(state.status).not.toBe("merge_ready");
    expect(state.steps.find((s) => s.id === "review")?.status).toBe("failed");
  }, 60_000);
});
