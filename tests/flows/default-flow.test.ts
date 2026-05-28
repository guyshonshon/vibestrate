import { describe, expect, it } from "vitest";
import { projectConfigSchema } from "../../src/project/config-schema.js";
import {
  builtinFlows,
  defaultFlow,
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
    roles: {
      planner: { provider: "claude", prompt: ".vibestrate/roles/planner.md", permissions: "readOnly" },
      architect: { provider: "claude", prompt: ".vibestrate/roles/architect.md", permissions: "readOnly" },
      executor: { provider: "claude", prompt: ".vibestrate/roles/executor.md", permissions: "codeWrite" },
      fixer: { provider: "claude", prompt: ".vibestrate/roles/fixer.md", permissions: "codeWrite" },
      reviewer: { provider: "codex", prompt: ".vibestrate/roles/reviewer.md", permissions: "readOnly" },
      verifier: { provider: "codex", prompt: ".vibestrate/roles/verifier.md", permissions: "readOnly" },
    },
  });
}

describe("Default flow definition (D2 phase B-2)", () => {
  it("is a schema-valid flow whose steps mirror the fixed plan→build→verify workflow", () => {
    // It is constructed via flowDefinitionSchema.parse at import; re-parsing
    // guards against a future edit that quietly relies on a default/transform.
    expect(() => flowDefinitionSchema.parse(defaultFlow)).not.toThrow();

    expect(defaultFlow.id).toBe("default");
    expect(defaultFlow.steps.map((s) => [s.id, s.kind, s.roleId ?? null])).toEqual([
      ["plan", "agent-turn", "planner"],
      ["architecture", "agent-turn", "architect"],
      ["implement", "agent-turn", "executor"],
      ["validation", "validation", null],
      ["review", "review-turn", "reviewer"],
      ["fix", "response-turn", "fixer"],
      ["revalidation", "validation", null],
      ["verify", "summary-turn", "verifier"],
    ]);
  });

  it("declares the review→fix loop as an adaptive loop gated by the head review", () => {
    expect(defaultFlow.loop).toEqual({
      from: "review",
      to: "revalidation",
      decisionStep: "review",
      maxIterations: 3,
    });
    const ids = defaultFlow.steps.map((s) => s.id);
    const fromI = ids.indexOf("review");
    const toI = ids.indexOf("revalidation");
    // The gate sits at the head of the body so the loop can exit to `verify`
    // before running `fix` when the review approves — mirrors run()'s loop.
    expect(fromI).toBeLessThan(toI);
    expect(ids.indexOf("verify")).toBeGreaterThan(toI);
    const decision = defaultFlow.steps.find((s) => s.id === defaultFlow.loop!.decisionStep);
    expect(decision?.kind).toBe("review-turn");
  });

  it("is in the discoverable catalog (B-3b: runnable as --flow default)", () => {
    // B-3a taught the flow runner to iterate the loop, so the default flow is
    // now a real catalog entry — runnable/forkable as `--flow default`.
    expect(builtinFlows.some((f) => f.id === "default")).toBe(true);
    expect(findBuiltinFlow("default")).not.toBeNull();
  });

  it("resolves against the six default roles, carrying the loop through unchanged", () => {
    const snapshot = resolveFlow({
      flow: defaultFlow,
      source: { kind: "builtin", ref: "default" },
      config: flowTestConfig(),
      task: "Add an audit-log writer.",
      resolvedAt: "2026-05-27T00:00:00.000Z",
    });

    // One slot per role, each bound to its configured provider.
    expect(snapshot.slots.map((s) => [s.id, s.defaultRole, s.providerId])).toEqual([
      ["planner", "planner", "claude"],
      ["architect", "architect", "claude"],
      ["executor", "executor", "claude"],
      ["reviewer", "reviewer", "codex"],
      ["fixer", "fixer", "claude"],
      ["verifier", "verifier", "codex"],
    ]);

    // No fixed repeats, so resolved step ids equal source ids — the loop refs
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
    expect(snapshot.loop).toEqual(defaultFlow.loop);
    for (const ref of [snapshot.loop!.from, snapshot.loop!.to, snapshot.loop!.decisionStep]) {
      expect(resolvedIds).toContain(ref);
    }
  });
});
