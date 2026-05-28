import { describe, expect, it } from "vitest";
import { projectConfigSchema } from "../../src/project/config-schema.js";
import { qualityArbitrationFlow } from "../../src/flows/catalog/builtin-flows.js";
import {
  flowDefinitionSchema,
  resolvedFlowSnapshotSchema,
} from "../../src/flows/schemas/flow-schema.js";
import {
  flowDecisionSummaryOutputSchema,
  flowFindingResponsesOutputSchema,
  flowFindingsOutputSchema,
} from "../../src/flows/schemas/flow-output-contracts.js";
import {
  FlowResolutionError,
  resolveFlow,
} from "../../src/flows/runtime/flow-resolver.js";
import {
  fakeFlowDecisionSummaryOutput,
  fakeFlowFindingResponsesOutput,
  fakeFlowFindingsOutput,
  fakeQualityArbitrationFlow,
} from "./fixtures/quality-arbitration-flow.js";

function flowTestConfig() {
  return projectConfigSchema.parse({
    project: { name: "flow-test" },
    providers: {
      claude: { type: "cli", command: "__flow_test_claude_must_not_run__" },
      codex: { type: "cli", command: "__flow_test_codex_must_not_run__" },
    },
    roles: {
      planner: {
        provider: "claude",
        prompt: ".vibestrate/roles/planner.md",
        permissions: "readOnly",
      },
      architect: {
        provider: "claude",
        prompt: ".vibestrate/roles/architect.md",
        permissions: "readOnly",
      },
      executor: {
        provider: "claude",
        prompt: ".vibestrate/roles/executor.md",
        permissions: "codeWrite",
      },
      fixer: {
        provider: "claude",
        prompt: ".vibestrate/roles/fixer.md",
        permissions: "codeWrite",
      },
      reviewer: {
        provider: "codex",
        prompt: ".vibestrate/roles/reviewer.md",
        permissions: "readOnly",
      },
      verifier: {
        provider: "codex",
        prompt: ".vibestrate/roles/verifier.md",
        permissions: "readOnly",
      },
    },
  });
}

describe("Flow Phase 0 contracts", () => {
  it("rejects malformed Flow definitions", () => {
    const result = flowDefinitionSchema.safeParse({
      ...fakeQualityArbitrationFlow,
      steps: [
        ...fakeQualityArbitrationFlow.steps,
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
        'Flow step "ghost-review" references unknown slot "missing-slot".',
      );
    }
  });

  it("resolves the built-in Quality Arbitration Flow from configured providers", () => {
    const snapshot = resolveFlow({
      flow: qualityArbitrationFlow,
      source: { kind: "builtin", ref: "quality-arbitration" },
      config: flowTestConfig(),
      task: "Add an audit-log writer.",
      skippedOptionalSteps: ["plan-review"],
      resolvedAt: "2026-05-22T00:00:00.000Z",
    });

    expect(resolvedFlowSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "builder", providerId: "claude" }),
        expect.objectContaining({ id: "challenger", providerId: "codex" }),
      ]),
    );
    expect(snapshot.steps.find((step) => step.id === "plan")).toEqual(
      expect.objectContaining({
        roleId: "planner",
        providerId: "claude",
        enabled: true,
      }),
    );
    expect(snapshot.steps.find((step) => step.id === "plan-review")).toEqual(
      expect.objectContaining({ enabled: false }),
    );
    expect(snapshot.steps.find((step) => step.id === "validation")).toEqual(
      expect.objectContaining({ roleId: null, providerId: null }),
    );
  });

  it("refuses a Flow provider override that project config does not define", () => {
    expect(() =>
      resolveFlow({
        flow: qualityArbitrationFlow,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config: flowTestConfig(),
        task: "Do not run a provider.",
        slotProviders: { challenger: "missing" },
      }),
    ).toThrow(FlowResolutionError);
    expect(() =>
      resolveFlow({
        flow: qualityArbitrationFlow,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config: flowTestConfig(),
        task: "Reject typos before a run starts.",
        slotProviders: { reviewer: "codex" },
      }),
    ).toThrow(/unknown Flow slot "reviewer"/);
  });

  it("parses deterministic Quality Arbitration JSON output fixtures", () => {
    expect(flowFindingsOutputSchema.parse(fakeFlowFindingsOutput)).toEqual(
      fakeFlowFindingsOutput,
    );
    expect(
      flowFindingResponsesOutputSchema.parse(fakeFlowFindingResponsesOutput),
    ).toEqual(fakeFlowFindingResponsesOutput);
    expect(
      flowDecisionSummaryOutputSchema.parse(fakeFlowDecisionSummaryOutput),
    ).toEqual(fakeFlowDecisionSummaryOutput);
  });
});
