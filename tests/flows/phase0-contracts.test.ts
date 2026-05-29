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
    profiles: {
      "claude-balanced": { provider: "claude" },
      "codex-balanced": { provider: "codex" },
      "opus-deep": { provider: "claude", model: "opus", power: "deep" },
    },
    crews: {
      default: {
        roles: {
          planner: { seats: ["planner"], profile: "claude-balanced", prompt: ".vibestrate/roles/planner.md", permissions: "readOnly" },
          architect: { seats: ["architect"], profile: "claude-balanced", prompt: ".vibestrate/roles/architect.md", permissions: "readOnly" },
          executor: { seats: ["implementer", "builder"], profile: "claude-balanced", prompt: ".vibestrate/roles/executor.md", permissions: "codeWrite" },
          fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: ".vibestrate/roles/fixer.md", permissions: "codeWrite" },
          reviewer: { seats: ["reviewer", "challenger"], profile: "codex-balanced", prompt: ".vibestrate/roles/reviewer.md", permissions: "readOnly" },
          verifier: { seats: ["verifier", "arbiter"], profile: "codex-balanced", prompt: ".vibestrate/roles/verifier.md", permissions: "readOnly" },
        },
      },
    },
    defaultCrew: "default",
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
          seat: "missing-seat",
          inputs: ["diff"],
          outputs: ["findings"],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Flow step "ghost-review" references unknown seat "missing-seat".',
      );
    }
  });

  it("resolves the built-in Quality Arbitration Flow: seat → crew role → profile → provider", () => {
    const snapshot = resolveFlow({
      flow: qualityArbitrationFlow,
      source: { kind: "builtin", ref: "quality-arbitration" },
      config: flowTestConfig(),
      task: "Add an audit-log writer.",
      skippedOptionalSteps: ["plan-review"],
      resolvedAt: "2026-05-22T00:00:00.000Z",
    });

    expect(resolvedFlowSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.crewId).toBe("default");
    // Seats are pure contracts — no provider on the seat itself.
    expect(snapshot.seats.map((s) => s.id)).toEqual(
      expect.arrayContaining(["builder", "challenger", "arbiter"]),
    );
    // plan → builder seat → executor role → claude-balanced → claude.
    expect(snapshot.steps.find((step) => step.id === "plan")).toEqual(
      expect.objectContaining({
        seat: "builder",
        resolvedRoleId: "executor",
        profileId: "claude-balanced",
        providerId: "claude",
        enabled: true,
      }),
    );
    // implementation-review → challenger seat → reviewer role → codex.
    expect(snapshot.steps.find((step) => step.id === "implementation-review")).toEqual(
      expect.objectContaining({
        seat: "challenger",
        resolvedRoleId: "reviewer",
        providerId: "codex",
      }),
    );
    expect(snapshot.steps.find((step) => step.id === "plan-review")).toEqual(
      expect.objectContaining({ enabled: false }),
    );
    // Seatless steps (validation) resolve no role/profile/provider.
    expect(snapshot.steps.find((step) => step.id === "validation")).toEqual(
      expect.objectContaining({ seat: null, resolvedRoleId: null, profileId: null, providerId: null }),
    );
  });

  it("a step-level Profile override changes only the runtime Profile, not the Role", () => {
    const snapshot = resolveFlow({
      flow: qualityArbitrationFlow,
      source: { kind: "builtin", ref: "quality-arbitration" },
      config: flowTestConfig(),
      task: "Implement crypto carefully.",
      stepProfileOverrides: { implement: "opus-deep" },
    });
    const step = snapshot.steps.find((s) => s.id === "implement")!;
    // Same Role behavior (executor), stronger runtime Profile + its provider.
    expect(step.resolvedRoleId).toBe("executor");
    expect(step.profileId).toBe("opus-deep");
    expect(step.providerId).toBe("claude");
  });

  it("fails clearly when no crew role fills a required seat", () => {
    const config = flowTestConfig();
    // Drop the role that fills the challenger seat.
    delete config.crews.default!.roles.reviewer;
    expect(() =>
      resolveFlow({
        flow: qualityArbitrationFlow,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config,
        task: "no challenger",
      }),
    ).toThrow(/needs the "challenger" seat/);
  });

  it("fails clearly when more than one crew role fills a seat", () => {
    const config = flowTestConfig();
    // Add a second role that also fills the builder seat → ambiguous.
    config.crews.default!.roles["builder2"] = {
      seats: ["builder"],
      profile: "claude-balanced",
      prompt: ".vibestrate/roles/executor.md",
      permissions: "codeWrite",
      skills: [],
      mcpServers: {},
    };
    expect(() =>
      resolveFlow({
        flow: qualityArbitrationFlow,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config,
        task: "ambiguous builder",
      }),
    ).toThrow(/more than one role filling the "builder" seat/);
  });

  it("refuses a step Profile override that references an unknown step", () => {
    expect(() =>
      resolveFlow({
        flow: qualityArbitrationFlow,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config: flowTestConfig(),
        task: "bad override",
        stepProfileOverrides: { "no-such-step": "opus-deep" },
      }),
    ).toThrow(FlowResolutionError);
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
