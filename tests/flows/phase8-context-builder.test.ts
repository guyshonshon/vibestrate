import { describe, expect, it } from "vitest";
import {
  buildFlowContextPacket,
  type FlowContextOutput,
} from "../../src/flows/runtime/flow-context-builder.js";
import { qualityArbitrationFlow } from "../../src/flows/catalog/builtin-flows.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { projectConfigSchema } from "../../src/project/config-schema.js";

const config = projectConfigSchema.parse({
  project: { name: "phase8" },
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

function output(
  token: string,
  content: string,
  path = `artifacts/flows/${token}.md`,
): FlowContextOutput {
  return {
    token,
    label: token,
    content,
    artifactPath: path,
  };
}

function snapshot(contextPolicy: "balanced" | "compact" | "artifact-heavy") {
  return resolveFlow({
    flow: qualityArbitrationFlow,
    source: { kind: "builtin", ref: qualityArbitrationFlow.id },
    config,
    task: "phase 8",
    contextPolicy,
    resolvedAt: "2026-05-23T00:00:00.000Z",
  });
}

describe("Flow Phase 8 context builder", () => {
  it("summarizes bulky artifacts under compact policy and records budget savings", () => {
    const s = snapshot("compact");
    const step = s.steps.find((candidate) => candidate.id === "implementation-review")!;
    const largeDiff = JSON.stringify(
      {
        totals: { files: 2, insertions: 120, deletions: 4 },
        files: [{ path: "src/a.ts" }, { path: "src/b.ts" }],
        patch: "x".repeat(10_000),
      },
      null,
      2,
    );
    const result = buildFlowContextPacket({
      snapshot: s,
      step,
      contextMode: "stateless",
      outputs: new Map([
        ["plan", output("plan", "A detailed implementation plan.".repeat(200))],
        ["diff", output("diff", largeDiff, "artifacts/flows/implement/diff-snapshot.json")],
        ["validation", output("validation", JSON.stringify({ summary: { total: 1, passed: 1, failed: 0 }, commands: [] }))],
      ]),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });

    expect(result.packet.contextPolicy).toBe("compact");
    expect(result.packet.budget.summarizedInputs).toBeGreaterThan(0);
    expect(result.packet.budget.estimatedTokensSaved).toBeGreaterThan(0);
    expect(
      result.packet.inputs.find((input) => input.token === "diff")?.disposition,
    ).toBe("embedded-summary");
    expect(result.priorArtifacts.map((artifact) => artifact.content).join("\n"))
      .toContain("Diff summary:");
    expect(result.priorArtifacts.map((artifact) => artifact.content).join("\n"))
      .not.toContain("x".repeat(2_000));
  });

  it("forces a bulky token to embedded-full when forceFullTokens demands it (preference review needs the exact artifact)", () => {
    const s = snapshot("compact");
    const step = s.steps.find((candidate) => candidate.id === "implementation-review")!;
    const largeDiff = JSON.stringify(
      {
        totals: { files: 1, insertions: 9, deletions: 0 },
        files: [{ path: "src/a.ts" }],
        patch: "src/a.ts: an em-dash — lurks on this changed line\n".repeat(400),
      },
      null,
      2,
    );
    const outputs = () =>
      new Map([
        ["diff", output("diff", largeDiff, "artifacts/flows/implement/diff-snapshot.json")],
      ]);

    // Baseline: compact policy summarizes the bulky diff, so the em-dash is gone.
    const baseline = buildFlowContextPacket({
      snapshot: s,
      step,
      contextMode: "stateless",
      outputs: outputs(),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });
    expect(
      baseline.packet.inputs.find((input) => input.token === "diff")?.disposition,
    ).toBe("embedded-summary");
    expect(baseline.priorArtifacts.map((a) => a.content).join("\n")).not.toContain(
      "em-dash — lurks on this changed line",
    );

    // Forced: the preference reviewer gets the exact artifact, em-dash and all.
    const forced = buildFlowContextPacket({
      snapshot: s,
      step,
      contextMode: "stateless",
      forceFullTokens: new Set(["diff"]),
      outputs: outputs(),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });
    expect(
      forced.packet.inputs.find((input) => input.token === "diff")?.disposition,
    ).toBe("embedded-full");
    expect(forced.priorArtifacts.map((a) => a.content).join("\n")).toContain(
      "em-dash — lurks on this changed line",
    );
  });

  it("embeds a tiny artifact full when summarizing would only add wrapper overhead", () => {
    const s = snapshot("compact");
    const step = s.steps.find((candidate) => candidate.id === "implementation-review")!;
    const result = buildFlowContextPacket({
      snapshot: s,
      step,
      contextMode: "stateless",
      outputs: new Map([
        ["plan", output("plan", "Add a --verbose flag.")],
        ["diff", output("diff", JSON.stringify({ totals: { files: 1, insertions: 1, deletions: 0 }, files: [{ path: "src/x.ts" }] }))],
        ["validation", output("validation", JSON.stringify({ summary: { total: 1, passed: 1, failed: 0 }, commands: [] }))],
      ]),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });
    const plan = result.packet.inputs.find((input) => input.token === "plan")!;
    // compact policy would normally summarize, but the summary wrapper would
    // inflate a tiny artifact - the overhead guard embeds it full instead.
    expect(plan.disposition).toBe("embedded-full");
    const joined = result.priorArtifacts.map((artifact) => artifact.content).join("\n");
    expect(joined).toContain("Add a --verbose flag.");
    expect(joined).not.toContain("Summary for plan:");
  });

  it("does not replay full prior artifacts into a reused participant session", () => {
    const s = snapshot("artifact-heavy");
    const step = s.steps.find((candidate) => candidate.id === "challenge-response")!;
    const findings = "finding details\n".repeat(500);
    const result = buildFlowContextPacket({
      snapshot: s,
      step,
      contextMode: "reused",
      outputs: new Map([
        ["findings", output("findings", findings)],
        ["diff", output("diff", JSON.stringify({ totals: { files: 1, insertions: 3, deletions: 0 }, files: [{ path: "src/x.ts" }] }))],
        ["validation", output("validation", JSON.stringify({ summary: { total: 1, passed: 1, failed: 0 }, commands: [] }))],
      ]),
      generatedAt: "2026-05-23T00:00:00.000Z",
    });

    expect(result.packet.contextMode).toBe("reused");
    expect(result.packet.inputs.every((input) =>
      input.token === "task-brief" || input.disposition !== "embedded-full",
    )).toBe(true);
    expect(result.packet.budget.estimatedTokensSaved).toBeGreaterThan(0);
    expect(result.priorArtifacts.map((artifact) => artifact.content).join("\n"))
      .not.toContain(findings);
  });
});
