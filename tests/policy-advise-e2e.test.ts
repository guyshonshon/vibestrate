import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema, isGraphFlow } from "../src/flows/schemas/flow-schema.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Project policy advise tier injected into the reviewer turn END-TO-END. The pure
// renderer is unit-tested in policy-advise.test.ts; this proves the orchestrator
// wires the block into a reviewer's prompt - under ANY active supervisor (the rule
// is project-scoped, not persona-owned), on BOTH the linear walk (runFlowSequence,
// what a plain `vibe run`/default flow takes) and the graph frontier.

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const FAKE = `let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  process.stdout.write('# Result\\nDECISION: APPROVED\\nok\\n'); process.exit(0);
});
`;

// The policy's correction text - distinctive enough to assert on.
const POLICY_FIX = "use a hyphen ( - ) instead";

function policyFlow(graph: boolean) {
  return flowDefinitionSchema.parse({
    id: graph ? "policy-graph" : "policy-linear",
    version: 1,
    label: "Policy flow",
    description: "build then review",
    seats: { builder: { label: "Builder" }, reviewer: { label: "Reviewer" } },
    steps: [
      { id: "build", label: "Build", kind: "agent-turn", seat: "builder" },
      {
        id: "review",
        label: "Review",
        kind: "review-turn",
        seat: "reviewer",
        stage: "reviewing",
        outputs: ["review-decision"],
        ...(graph ? { needs: ["build"] } : {}),
      },
    ],
  });
}
const LINEAR_FLOW = policyFlow(false);
const GRAPH_FLOW = policyFlow(true);

describe("project policy advise - reviewer-turn injection end-to-end", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policy-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE);
    await setConfigValue(
      dir,
      "providers.codex",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    await setConfigValue(dir, "profiles.codex-x", JSON.stringify({ provider: "codex", power: "low" }));
    await setConfigValue(
      dir,
      "crews.t",
      JSON.stringify({
        label: "T",
        roles: {
          r: {
            label: "Role",
            profile: "codex-x",
            seats: ["builder", "reviewer"],
            prompt: ".vibestrate/roles/planner.md",
            permissions: "read_only",
            skills: [],
          },
        },
      }),
    );
    await setConfigValue(dir, "defaultCrew", "t");
    // ONE confirmed, unscoped PROJECT policy - belongs to the project, not a persona.
    await setConfigValue(
      dir,
      "projectPolicies",
      JSON.stringify([
        {
          id: "no-em-dash",
          statement: "do not use em-dash characters",
          correction: POLICY_FIX,
          confirmedAt: "2026-06-28T00:00:00.000Z",
        },
      ]),
    );
  });

  async function runWith(flowDef: typeof LINEAR_FLOW) {
    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: flowDef,
      source: { kind: "builtin", ref: flowDef.id },
      config: loaded.config,
      task: "probe policy injection",
    });
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "probe policy injection",
      isGitRepo: true,
      flow: resolved,
      // Run under the DEFAULT persona, which does not "own" the rule - proves the
      // project policy reaches the review under any supervisor.
      personaId: "staff-engineer",
      onProgress: () => {},
    });
    const out = await orch.run();
    const store = new ArtifactStore(dir, out.runId);
    return {
      review: await store.read("flows/review/prompt.md"),
      build: await store.read("flows/build/prompt.md"),
    };
  }

  it("injects the policy into the reviewer prompt on the LINEAR walk (default-flow shape)", async () => {
    expect(isGraphFlow(LINEAR_FLOW)).toBe(false);
    const { review, build } = await runWith(LINEAR_FLOW);
    expect(review).toContain(POLICY_FIX);
    expect(build).not.toContain(POLICY_FIX);
  }, 60_000);

  it("injects the policy into the reviewer prompt on the GRAPH frontier", async () => {
    expect(isGraphFlow(GRAPH_FLOW)).toBe(true);
    const { review, build } = await runWith(GRAPH_FLOW);
    expect(review).toContain(POLICY_FIX);
    expect(build).not.toContain(POLICY_FIX);
  }, 60_000);
});
