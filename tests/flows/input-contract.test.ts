import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildFlowContextPacket as buildThroughFunnel,
  FlowInputContractError,
} from "../../src/core/run-engine/flow-outputs.js";
import { ArtifactStore } from "../../src/core/stores/artifact-store.js";
import {
  buildFlowContextPacket,
  type FlowContextOutput,
} from "../../src/flows/runtime/flow-context-builder.js";
import { flowStepSchema } from "../../src/flows/schemas/flow-schema.js";
import { qualityArbitrationFlow } from "../../src/flows/catalog/builtin-flows.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { projectConfigSchema } from "../../src/project/config-schema.js";

/**
 * A step may declare inputs it cannot work without. Those are delivered WHOLE
 * or the step fails closed naming what is missing - never summarized to fit a
 * budget, never silently omitted.
 *
 * The failure this closes shipped once: a reviewer was told "the exact content
 * is available in the artifact above" while holding a summary of the diff, and
 * a path it could not open. That instance was fixed by passing the artifact
 * root. This makes the class impossible.
 */
const config = projectConfigSchema.parse({
  project: { name: "contract" },
  providers: {
    claude: { type: "claude-code", command: "claude", input: "stdin" },
    codex: { type: "cli", command: "codex", input: "stdin" },
  },
  profiles: {
    "claude-balanced": { provider: "claude" },
    "codex-balanced": { provider: "codex" },
  },
  crews: {
    default: {
      roles: {
        planner: { seats: ["planner"], profile: "claude-balanced", permissions: "readOnly", prompt: "planner.md" },
        architect: { seats: ["architect"], profile: "claude-balanced", permissions: "readOnly", prompt: "architect.md" },
        executor: { seats: ["implementer", "builder"], profile: "claude-balanced", permissions: "codeWrite", prompt: "executor.md" },
        fixer: { seats: ["fixer"], profile: "claude-balanced", permissions: "codeWrite", prompt: "fixer.md" },
        reviewer: { seats: ["reviewer", "challenger"], profile: "codex-balanced", permissions: "readOnly", prompt: "reviewer.md" },
        verifier: { seats: ["verifier", "arbiter"], profile: "claude-balanced", permissions: "readOnly", prompt: "verifier.md" },
      },
    },
  },
  defaultCrew: "default",
});

function output(token: string, content: string): FlowContextOutput {
  return {
    token,
    label: token,
    content,
    artifactPath: `artifacts/flows/${token}.md`,
  };
}

function snapshot() {
  return resolveFlow({
    flow: qualityArbitrationFlow,
    source: { kind: "builtin", ref: qualityArbitrationFlow.id },
    config,
    task: "input contracts",
    contextPolicy: "balanced",
    resolvedAt: "2026-05-23T00:00:00.000Z",
  });
}

describe("per-step input contracts", () => {
  it("rejects at load a required input the step never receives", () => {
    const parsed = flowStepSchema.safeParse({
      id: "review",
      label: "Review",
      kind: "review-turn",
      seat: "reviewer",
      inputs: ["findings"],
      requiredInputs: ["diff"],
      outputs: [],
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("does not declare it in");
  });

  it("a required input is never summarized, even when the budget is blown", () => {
    const s = snapshot();
    const step = s.steps.find((candidate) => candidate.id === "challenge-response")!;
    const huge = "a line of findings that must reach the reviewer intact\n".repeat(40_000);
    const result = buildFlowContextPacket({
      snapshot: s,
      // The budget is far too small for this artifact, which is exactly when
      // the old builder would have summarized it.
      contextBudgetTokens: 500,
      step: { ...step, requiredInputs: ["findings"] },
      contextMode: "stateless",
      outputs: new Map([["findings", output("findings", huge)]]),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });

    const findings = result.packet.inputs.find((i) => i.token === "findings");
    expect(findings?.disposition).toBe("embedded-full");
    // Delivered whole, so the contract is met and nothing is reported.
    expect(result.packet.contractViolations).toEqual([]);
    expect(result.priorArtifacts.map((a) => a.content).join("\n")).toContain(huge.trim());
  });

  it("reports a violation when a required input has not been produced", () => {
    const s = snapshot();
    const step = s.steps.find((candidate) => candidate.id === "challenge-response")!;
    const result = buildFlowContextPacket({
      snapshot: s,
      step: { ...step, requiredInputs: ["findings", "diff"] },
      contextMode: "stateless",
      // `diff` is absent.
      outputs: new Map([["findings", output("findings", "a finding")]]),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });

    expect(result.packet.contractViolations).toHaveLength(1);
    expect(result.packet.contractViolations[0]?.token).toBe("diff");
    expect(result.packet.contractViolations[0]?.reason).toContain("has not been produced");
  });

  it("a step declaring no contract behaves exactly as before", () => {
    const s = snapshot();
    const step = s.steps.find((candidate) => candidate.id === "challenge-response")!;
    const result = buildFlowContextPacket({
      snapshot: s,
      step,
      contextMode: "stateless",
      outputs: new Map([["findings", output("findings", "a finding")]]),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });
    expect(step.requiredInputs).toEqual([]);
    expect(result.packet.contractViolations).toEqual([]);
  });

  it("FAILS CLOSED through the funnel, and writes the packet before it throws", async () => {
    // The throw lives in flow-outputs.ts rather than at each call site, so no
    // caller can forget it. The packet is written FIRST on purpose: it is the
    // evidence of what the contract asked for and what it got, and it has to
    // survive the failure.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-contract-"));
    const store = new ArtifactStore(root, "brave-otter");
    await store.init();

    const s = snapshot();
    const step = s.steps.find((candidate) => candidate.id === "challenge-response")!;

    let written: string | null = null;
    const spy = store.writeJson.bind(store);
    store.writeJson = async (rel: string, value: unknown) => {
      const abs = await spy(rel, value);
      written = abs;
      return abs;
    };

    await expect(
      buildThroughFunnel({
        snapshot: s,
        step: { ...step, requiredInputs: ["diff"] },
        outputs: new Map([["findings", output("findings", "a finding")]]),
        artifactStore: store,
        contextMode: "stateless",
      }),
    ).rejects.toBeInstanceOf(FlowInputContractError);

    // The path comes from the store's own return value, not a guess.
    expect(written).not.toBeNull();
    const packet = JSON.parse(await fs.readFile(written!, "utf8")) as {
      contractViolations: { token: string }[];
    };
    expect(packet.contractViolations.map((v) => v.token)).toEqual(["diff"]);

    await fs.rm(root, { recursive: true, force: true });
  });
});
