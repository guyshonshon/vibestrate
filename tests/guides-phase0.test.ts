import { describe, expect, it } from "vitest";
import { projectConfigSchema } from "../src/project/config-schema.js";
import { qualityArbitrationGuide } from "../src/guides/builtin-guides.js";
import {
  guideDefinitionSchema,
  resolvedGuideSnapshotSchema,
} from "../src/guides/guide-schema.js";
import {
  guideDecisionSummaryOutputSchema,
  guideFindingResponsesOutputSchema,
  guideFindingsOutputSchema,
} from "../src/guides/guide-output-contracts.js";
import {
  GuideResolutionError,
  resolveGuide,
} from "../src/guides/guide-resolver.js";
import {
  fakeGuideDecisionSummaryOutput,
  fakeGuideFindingResponsesOutput,
  fakeGuideFindingsOutput,
  fakeQualityArbitrationGuide,
} from "./fixtures/quality-arbitration-guide.js";

function guideTestConfig() {
  return projectConfigSchema.parse({
    project: { name: "guide-test" },
    providers: {
      claude: { type: "cli", command: "__guide_test_claude_must_not_run__" },
      codex: { type: "cli", command: "__guide_test_codex_must_not_run__" },
    },
    agents: {
      planner: {
        provider: "claude",
        prompt: ".amaco/agents/planner.md",
        permissions: "readOnly",
      },
      architect: {
        provider: "claude",
        prompt: ".amaco/agents/architect.md",
        permissions: "readOnly",
      },
      executor: {
        provider: "claude",
        prompt: ".amaco/agents/executor.md",
        permissions: "codeWrite",
      },
      fixer: {
        provider: "claude",
        prompt: ".amaco/agents/fixer.md",
        permissions: "codeWrite",
      },
      reviewer: {
        provider: "codex",
        prompt: ".amaco/agents/reviewer.md",
        permissions: "readOnly",
      },
      verifier: {
        provider: "codex",
        prompt: ".amaco/agents/verifier.md",
        permissions: "readOnly",
      },
    },
  });
}

describe("Guide Phase 0 contracts", () => {
  it("rejects malformed Guide definitions", () => {
    const result = guideDefinitionSchema.safeParse({
      ...fakeQualityArbitrationGuide,
      steps: [
        ...fakeQualityArbitrationGuide.steps,
        {
          id: "ghost-review",
          label: "Ghost Review",
          kind: "review-turn",
          slot: "missing-slot",
          inputs: ["diff"],
          outputs: ["findings"],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Guide step "ghost-review" references unknown slot "missing-slot".',
      );
    }
  });

  it("resolves the built-in Quality Arbitration Guide from configured providers", () => {
    const snapshot = resolveGuide({
      guide: qualityArbitrationGuide,
      source: { kind: "builtin", ref: "quality-arbitration" },
      config: guideTestConfig(),
      task: "Add an audit-log writer.",
      skippedOptionalSteps: ["plan-review"],
      resolvedAt: "2026-05-22T00:00:00.000Z",
    });

    expect(resolvedGuideSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "builder", providerId: "claude" }),
        expect.objectContaining({ id: "challenger", providerId: "codex" }),
      ]),
    );
    expect(snapshot.steps.find((step) => step.id === "plan")).toEqual(
      expect.objectContaining({
        agentId: "planner",
        providerId: "claude",
        enabled: true,
      }),
    );
    expect(snapshot.steps.find((step) => step.id === "plan-review")).toEqual(
      expect.objectContaining({ enabled: false }),
    );
    expect(snapshot.steps.find((step) => step.id === "validation")).toEqual(
      expect.objectContaining({ agentId: null, providerId: null }),
    );
  });

  it("refuses a Guide provider override that project config does not define", () => {
    expect(() =>
      resolveGuide({
        guide: qualityArbitrationGuide,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config: guideTestConfig(),
        task: "Do not run a provider.",
        slotProviders: { challenger: "missing" },
      }),
    ).toThrow(GuideResolutionError);
    expect(() =>
      resolveGuide({
        guide: qualityArbitrationGuide,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config: guideTestConfig(),
        task: "Reject typos before a run starts.",
        slotProviders: { reviewer: "codex" },
      }),
    ).toThrow(/unknown Guide slot "reviewer"/);
  });

  it("parses deterministic Quality Arbitration JSON output fixtures", () => {
    expect(guideFindingsOutputSchema.parse(fakeGuideFindingsOutput)).toEqual(
      fakeGuideFindingsOutput,
    );
    expect(
      guideFindingResponsesOutputSchema.parse(fakeGuideFindingResponsesOutput),
    ).toEqual(fakeGuideFindingResponsesOutput);
    expect(
      guideDecisionSummaryOutputSchema.parse(fakeGuideDecisionSummaryOutput),
    ).toEqual(fakeGuideDecisionSummaryOutput);
  });
});
