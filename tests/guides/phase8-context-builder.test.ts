import { describe, expect, it } from "vitest";
import {
  buildGuideContextPacket,
  type GuideContextOutput,
} from "../../src/guides/runtime/guide-context-builder.js";
import { qualityArbitrationGuide } from "../../src/guides/catalog/builtin-guides.js";
import { resolveGuide } from "../../src/guides/runtime/guide-resolver.js";
import { projectConfigSchema } from "../../src/project/config-schema.js";

const config = projectConfigSchema.parse({
  project: { name: "phase8" },
  providers: {
    claude: { type: "claude-code", command: "claude", input: "stdin" },
    codex: { type: "cli", command: "codex", input: "stdin" },
  },
  roles: {
    planner: { provider: "claude", permissions: "readOnly", prompt: "planner.md" },
    architect: { provider: "claude", permissions: "readOnly", prompt: "architect.md" },
    executor: { provider: "claude", permissions: "codeWrite", prompt: "executor.md" },
    fixer: { provider: "claude", permissions: "codeWrite", prompt: "fixer.md" },
    reviewer: { provider: "codex", permissions: "readOnly", prompt: "reviewer.md" },
    verifier: { provider: "claude", permissions: "readOnly", prompt: "verifier.md" },
  },
});

function output(
  token: string,
  content: string,
  path = `artifacts/guides/${token}.md`,
): GuideContextOutput {
  return {
    token,
    label: token,
    content,
    artifactPath: path,
  };
}

function snapshot(contextPolicy: "balanced" | "compact" | "artifact-heavy") {
  return resolveGuide({
    guide: qualityArbitrationGuide,
    source: { kind: "builtin", ref: qualityArbitrationGuide.id },
    config,
    task: "phase 8",
    contextPolicy,
    resolvedAt: "2026-05-23T00:00:00.000Z",
  });
}

describe("Guide Phase 8 context builder", () => {
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
    const result = buildGuideContextPacket({
      snapshot: s,
      step,
      contextMode: "stateless",
      outputs: new Map([
        ["plan", output("plan", "A detailed implementation plan.".repeat(200))],
        ["diff", output("diff", largeDiff, "artifacts/guides/implement/diff-snapshot.json")],
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

  it("does not replay full prior artifacts into a reused participant session", () => {
    const s = snapshot("artifact-heavy");
    const step = s.steps.find((candidate) => candidate.id === "challenge-response")!;
    const findings = "finding details\n".repeat(500);
    const result = buildGuideContextPacket({
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
