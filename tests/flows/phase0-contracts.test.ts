import { describe, expect, it } from "vitest";
import { projectConfigSchema } from "../../src/project/config-schema.js";
import {
  findBuiltinFlow,
  qualityArbitrationFlow,
} from "../../src/flows/catalog/builtin-flows.js";
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
          planner: { seats: ["planner"], profile: "claude-balanced", prompt: ".vibestrate/roles/planner.md", permissions: "read_only" },
          architect: { seats: ["architect"], profile: "claude-balanced", prompt: ".vibestrate/roles/architect.md", permissions: "read_only" },
          executor: { seats: ["implementer", "builder"], profile: "claude-balanced", prompt: ".vibestrate/roles/executor.md", permissions: "code_write" },
          fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: ".vibestrate/roles/fixer.md", permissions: "code_write" },
          reviewer: { seats: ["reviewer", "challenger"], profile: "codex-balanced", prompt: ".vibestrate/roles/reviewer.md", permissions: "read_only" },
          verifier: { seats: ["verifier", "arbiter"], profile: "codex-balanced", prompt: ".vibestrate/roles/verifier.md", permissions: "read_only" },
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
    // Seats are pure contracts - no provider on the seat itself.
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
      permissions: "code_write",
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

  it("a seat role override disambiguates an otherwise-ambiguous seat", () => {
    const config = flowTestConfig();
    config.crews.default!.roles["builder2"] = {
      seats: ["builder"],
      profile: "opus-deep",
      prompt: ".vibestrate/roles/executor.md",
      permissions: "code_write",
      skills: [],
      mcpServers: {},
    };
    // Pin the builder seat to the second role; resolution succeeds.
    const snapshot = resolveFlow({
      flow: qualityArbitrationFlow,
      source: { kind: "builtin", ref: "quality-arbitration" },
      config,
      task: "disambiguated builder",
      seatRoleOverrides: { builder: "builder2" },
    });
    const plan = snapshot.steps.find((s) => s.id === "plan")!;
    expect(plan.resolvedRoleId).toBe("builder2");
    expect(plan.profileId).toBe("opus-deep");
    // Pinning to a role that doesn't fill the seat fails clearly.
    expect(() =>
      resolveFlow({
        flow: qualityArbitrationFlow,
        source: { kind: "builtin", ref: "quality-arbitration" },
        config,
        task: "bad pin",
        seatRoleOverrides: { builder: "reviewer" },
      }),
    ).toThrow(/not a role in crew/);
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

  it("carries graph `needs` + per-step `instructions` through resolve unchanged", () => {
    const graphFlow = flowDefinitionSchema.parse({
      id: "mini-panel",
      version: 1,
      label: "Mini Panel",
      description: "A small DAG: plan -> two parallel reviewers -> arbiter join.",
      seats: {
        planner: { label: "Planner" },
        challenger: { label: "Challenger" },
        arbiter: { label: "Arbiter" },
      },
      steps: [
        { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
        {
          id: "review-a",
          label: "Correctness",
          kind: "review-turn",
          seat: "challenger",
          needs: ["plan"],
          outputs: ["findings-a"],
          instructions: "Lens: correctness only.",
        },
        {
          id: "review-b",
          label: "Tests",
          kind: "review-turn",
          seat: "challenger",
          needs: ["plan"],
          outputs: ["findings-b"],
          instructions: "Lens: test coverage only.",
        },
        {
          id: "arbiter",
          label: "Arbiter",
          kind: "summary-turn",
          seat: "arbiter",
          needs: ["review-a", "review-b"],
          outputs: ["verification"],
        },
      ],
    });
    const snapshot = resolveFlow({
      flow: graphFlow,
      source: { kind: "fixture", ref: "mini-panel" },
      config: flowTestConfig(),
      task: "Exercise a graph resolve.",
    });
    // Re-parsing the snapshot proves the new fields are schema-valid.
    expect(resolvedFlowSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.steps.find((s) => s.id === "arbiter")!.needs).toEqual([
      "review-a",
      "review-b",
    ]);
    expect(snapshot.steps.find((s) => s.id === "review-a")!.instructions).toBe(
      "Lens: correctness only.",
    );
    // Linear steps keep an empty needs + null instructions (no behavior change).
    expect(snapshot.steps.find((s) => s.id === "plan")!.needs).toEqual([]);
    expect(snapshot.steps.find((s) => s.id === "plan")!.instructions).toBeNull();
  });

  it("rejects a parallel group whose members resolve to a write-capable role", () => {
    // Two steps sharing needs=[plan] -> a parallel group. They sit on the
    // `implementer` seat, which the default crew fills with the code_write
    // `executor` role. Resolve must refuse it (one writer per worktree).
    const writerPanel = flowDefinitionSchema.parse({
      id: "writer-panel",
      version: 1,
      label: "Writer Panel",
      description: "An (invalid) attempt to fan out two writers in parallel.",
      seats: {
        planner: { label: "Planner" },
        implementer: { label: "Implementer" },
      },
      steps: [
        { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
        {
          id: "build-a",
          label: "Build A",
          kind: "agent-turn",
          seat: "implementer",
          needs: ["plan"],
          outputs: ["execution-a"],
        },
        {
          id: "build-b",
          label: "Build B",
          kind: "agent-turn",
          seat: "implementer",
          needs: ["plan"],
          outputs: ["execution-b"],
        },
      ],
    });
    expect(() =>
      resolveFlow({
        flow: writerPanel,
        source: { kind: "fixture", ref: "writer-panel" },
        config: flowTestConfig(),
        task: "fan out two writers (should be refused)",
      }),
    ).toThrow(/parallel group.*read-only|can write/);
  });

  it("resolves the built-in panel-review flow (read-only reviewers pass)", () => {
    const flow = findBuiltinFlow("panel-review")!;
    const snapshot = resolveFlow({
      flow,
      source: { kind: "builtin", ref: "panel-review" },
      config: flowTestConfig(),
      task: "Exercise the late review panel.",
    });
    // The three reviewers share the read-only `reviewer` seat; the arbiter sits
    // on the `arbiter` seat (the read-only verifier role).
    const reviewers = snapshot.steps.filter((s) => s.seat === "reviewer");
    expect(reviewers.map((s) => s.id).sort()).toEqual([
      "review-correctness",
      "review-risk",
      "review-tests",
    ]);
    expect(snapshot.steps.find((s) => s.id === "arbiter")!.needs.sort()).toEqual([
      "review-correctness",
      "review-risk",
      "review-tests",
    ]);
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
