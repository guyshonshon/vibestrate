import { describe, expect, it } from "vitest";
import { projectConfigSchema } from "../../src/project/config-schema.js";
import {
  builtinFlows,
  deepFlow,
  findBuiltinFlow,
} from "../../src/flows/catalog/builtin-flows.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";

function flowTestConfig() {
  return projectConfigSchema.parse({
    project: { name: "default-flow-test" },
    providers: {
      claude: { type: "cli", command: "__must_not_run__" },
      codex: { type: "cli", command: "__must_not_run__" },
    },
    profiles: {
      "claude-balanced": { provider: "claude" },
      "codex-balanced": { provider: "codex" },
    },
    crews: {
      default: {
        roles: {
          planner: { seats: ["planner"], profile: "claude-balanced", prompt: ".vibestrate/roles/planner.json", permissions: "readOnly" },
          architect: { seats: ["architect"], profile: "claude-balanced", prompt: ".vibestrate/roles/architect.json", permissions: "readOnly" },
          executor: { seats: ["implementer"], profile: "claude-balanced", prompt: ".vibestrate/roles/executor.json", permissions: "codeWrite" },
          fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: ".vibestrate/roles/fixer.json", permissions: "codeWrite" },
          reviewer: { seats: ["reviewer"], profile: "codex-balanced", prompt: ".vibestrate/roles/reviewer.json", permissions: "readOnly" },
          verifier: { seats: ["verifier"], profile: "codex-balanced", prompt: ".vibestrate/roles/verifier.json", permissions: "readOnly" },
        },
      },
    },
    defaultCrew: "default",
  });
}

describe("Deep flow definition (the six-seat pipeline, formerly default)", () => {
  it("is a schema-valid flow whose steps mirror the fixed plan→build→verify workflow", () => {
    // It is constructed via flowDefinitionSchema.parse at import; re-parsing
    // guards against a future edit that quietly relies on a default/transform.
    expect(() => flowDefinitionSchema.parse(deepFlow)).not.toThrow();

    expect(deepFlow.id).toBe("deep");
    expect(deepFlow.steps.map((s) => [s.id, s.kind, s.seat ?? null])).toEqual([
      ["plan", "agent-turn", "planner"],
      ["architecture", "agent-turn", "architect"],
      ["implement", "agent-turn", "implementer"],
      ["validation", "validation", null],
      ["review", "review-turn", "reviewer"],
      ["fix", "response-turn", "fixer"],
      ["revalidation", "validation", null],
      ["verify", "summary-turn", "verifier"],
    ]);
  });

  it("declares the review→fix loop as an adaptive loop gated by the head review", () => {
    expect(deepFlow.loop).toEqual({
      from: "review",
      to: "revalidation",
      decisionStep: "review",
      maxIterations: 3,
    });
    const ids = deepFlow.steps.map((s) => s.id);
    const fromI = ids.indexOf("review");
    const toI = ids.indexOf("revalidation");
    // The gate sits at the head of the body so the loop can exit to `verify`
    // before running `fix` when the review approves - mirrors run()'s loop.
    expect(fromI).toBeLessThan(toI);
    expect(ids.indexOf("verify")).toBeGreaterThan(toI);
    const decision = deepFlow.steps.find((s) => s.id === deepFlow.loop!.decisionStep);
    expect(decision?.kind).toBe("review-turn");
  });

  it("is in the discoverable catalog (runnable as --flow deep)", () => {
    // B-3a taught the flow runner to iterate the loop, so the default flow is
    // now a real catalog entry - runnable/forkable as `--flow default`.
    expect(builtinFlows.some((f) => f.id === "deep")).toBe(true);
    expect(builtinFlows.some((f) => f.id === "default")).toBe(true);
    expect(findBuiltinFlow("deep")).not.toBeNull();
  });

  it("resolves against the six default roles, carrying the loop through unchanged", () => {
    const snapshot = resolveFlow({
      flow: deepFlow,
      source: { kind: "builtin", ref: "deep" },
      config: flowTestConfig(),
      task: "Add an audit-log writer.",
      resolvedAt: "2026-05-27T00:00:00.000Z",
    });

    // Seats are declared by the flow; each seated step resolves to its crew
    // role's profile/provider.
    expect(snapshot.seats.map((s) => s.id)).toEqual([
      "planner",
      "architect",
      "implementer",
      "reviewer",
      "fixer",
      "verifier",
    ]);
    expect(
      snapshot.steps
        .filter((s) => s.seat)
        .map((s) => [s.seat, s.resolvedRoleId, s.providerId]),
    ).toEqual([
      ["planner", "planner", "claude"],
      ["architect", "architect", "claude"],
      ["implementer", "executor", "claude"],
      ["reviewer", "reviewer", "codex"],
      ["fixer", "fixer", "claude"],
      ["verifier", "verifier", "codex"],
    ]);

    // No fixed repeats, so resolved step ids equal source ids - the loop refs
    // stay valid in the snapshot.
    const resolvedIds = snapshot.steps.map((s) => s.id);
    expect(resolvedIds).toEqual([
      "plan",
      "architecture",
      "implement",
      "validation",
      "review",
      "fix",
      "revalidation",
      "verify",
    ]);
    expect(snapshot.loop).toEqual(deepFlow.loop);
    for (const ref of [snapshot.loop!.from, snapshot.loop!.to, snapshot.loop!.decisionStep]) {
      expect(resolvedIds).toContain(ref);
    }
  });
});
