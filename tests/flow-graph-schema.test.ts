import { describe, it, expect } from "vitest";
import {
  flowDefinitionSchema,
  isGraphFlow,
  parallelGroupsOf,
  MAX_PARALLEL_FANOUT,
} from "../src/flows/schemas/flow-schema.js";

// A late-review-panel-shaped graph flow: plan -> implement -> validate ->
// {three read-only reviewers fanning out from validate} -> arbiter join.
function panelFlow(overrides: { steps?: unknown[] } = {}) {
  return {
    id: "panel",
    version: 1,
    label: "Panel",
    description: "A graph flow with a parallel review panel and a join.",
    seats: {
      planner: { label: "Planner" },
      implementer: { label: "Implementer" },
      reviewer: { label: "Reviewer" },
      arbiter: { label: "Arbiter" },
    },
    steps: overrides.steps ?? [
      { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
      {
        id: "implement",
        label: "Implement",
        kind: "agent-turn",
        seat: "implementer",
        needs: ["plan"],
        outputs: ["execution", "diff"],
      },
      { id: "validate", label: "Validate", kind: "validation", needs: ["implement"], outputs: ["validation"] },
      {
        id: "review-a",
        label: "Review A",
        kind: "review-turn",
        seat: "reviewer",
        needs: ["validate"],
        outputs: ["findings-a"],
      },
      {
        id: "review-b",
        label: "Review B",
        kind: "review-turn",
        seat: "reviewer",
        needs: ["validate"],
        outputs: ["findings-b"],
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
  };
}

describe("flow graph (DAG) schema", () => {
  it("accepts a valid panel-shaped DAG in topological order", () => {
    const r = flowDefinitionSchema.safeParse(panelFlow());
    expect(r.success).toBe(true);
  });

  it("treats a flow with no needs as linear (not graph mode)", () => {
    const flow = flowDefinitionSchema.parse({
      id: "linear",
      version: 1,
      label: "Linear",
      description: "No needs anywhere.",
      seats: { planner: { label: "Planner" } },
      steps: [{ id: "plan", label: "Plan", kind: "agent-turn", seat: "planner" }],
    });
    expect(isGraphFlow(flow)).toBe(false);
  });

  it("reports graph mode when any step declares needs", () => {
    const flow = flowDefinitionSchema.parse(panelFlow());
    expect(isGraphFlow(flow)).toBe(true);
  });

  it("rejects a need on an unknown step", () => {
    const r = flowDefinitionSchema.safeParse(
      panelFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner" },
          { id: "implement", label: "Implement", kind: "agent-turn", seat: "implementer", needs: ["nope"] },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a self-dependency", () => {
    const r = flowDefinitionSchema.safeParse(
      panelFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", needs: ["plan"] },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a forward edge (not a topological order / would form a cycle)", () => {
    const r = flowDefinitionSchema.safeParse(
      panelFlow({
        steps: [
          // plan depends on a step declared *after* it -> rejected.
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", needs: ["implement"] },
          { id: "implement", label: "Implement", kind: "agent-turn", seat: "implementer", needs: ["plan"] },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects two concurrent steps that write the same output", () => {
    const r = flowDefinitionSchema.safeParse(
      panelFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
          { id: "a", label: "A", kind: "review-turn", seat: "reviewer", needs: ["plan"], outputs: ["findings"] },
          // same needs set as `a` -> a parallel group; same output token -> rejected.
          { id: "b", label: "B", kind: "review-turn", seat: "reviewer", needs: ["plan"], outputs: ["findings"] },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a parallel group wider than the fan-out cap", () => {
    const reviewers = Array.from({ length: MAX_PARALLEL_FANOUT + 1 }, (_, i) => ({
      id: `r${i}`,
      label: `R${i}`,
      kind: "review-turn",
      seat: "reviewer",
      needs: ["plan"],
      outputs: [`findings-${i}`],
    }));
    const r = flowDefinitionSchema.safeParse(
      panelFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
          ...reviewers,
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects combining needs with an adaptive loop", () => {
    const flow = {
      ...panelFlow(),
      loop: { from: "review-a", to: "arbiter", decisionStep: "review-a", maxIterations: 2 },
    };
    expect(flowDefinitionSchema.safeParse(flow).success).toBe(false);
  });

  it("rejects combining needs with a checklist segment", () => {
    const flow = {
      ...panelFlow(),
      checklistSegment: { from: "implement", to: "validate" },
    };
    expect(flowDefinitionSchema.safeParse(flow).success).toBe(false);
  });

  it("rejects a graph step that also declares a fixed repeat", () => {
    const r = flowDefinitionSchema.safeParse(
      panelFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
          {
            id: "implement",
            label: "Implement",
            kind: "agent-turn",
            seat: "implementer",
            needs: ["plan"],
            repeat: { times: 2 },
          },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it("parallelGroupsOf groups steps by identical needs set", () => {
    const flow = flowDefinitionSchema.parse(panelFlow());
    const groups = parallelGroupsOf(flow.steps);
    const concurrent = groups.filter((g) => g.length >= 2);
    expect(concurrent).toHaveLength(1);
    expect(concurrent[0]!.map((s) => s.id).sort()).toEqual(["review-a", "review-b"]);
  });
});
