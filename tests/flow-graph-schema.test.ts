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

  // ── Phase D: checklist DAGs (graph x per-item band) ──────────────────────
  // A graph flow MAY now declare a checklistSegment, as long as the DAG is
  // confined to the per-item band (prelude/postlude stay linear).
  function checklistGraphFlow(overrides: { steps?: unknown[]; segment?: unknown } = {}) {
    return {
      id: "pickup-graph",
      version: 1,
      label: "Pickup graph",
      description: "A checklist flow with a DAG inside the per-item band.",
      seats: {
        planner: { label: "Planner" },
        reviewer: { label: "Analyst" },
        implementer: { label: "Implementer" },
      },
      steps: overrides.steps ?? [
        { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
        { id: "micro-plan", label: "Micro-plan", kind: "agent-turn", seat: "planner", outputs: ["micro-plan"] },
        { id: "a", label: "A", kind: "agent-turn", seat: "reviewer", needs: ["micro-plan"], outputs: ["analysis-a"] },
        { id: "b", label: "B", kind: "agent-turn", seat: "reviewer", needs: ["micro-plan"], outputs: ["analysis-b"] },
        { id: "implement", label: "Implement", kind: "agent-turn", seat: "implementer", needs: ["a", "b"], outputs: ["execution", "diff"] },
        { id: "review", label: "Review", kind: "review-turn", seat: "reviewer", outputs: ["review-decision"] },
      ],
      checklistSegment: overrides.segment ?? { from: "micro-plan", to: "implement" },
    };
  }

  it("accepts a checklist + graph flow when the DAG is confined to the band", () => {
    const r = flowDefinitionSchema.safeParse(checklistGraphFlow());
    expect(r.success).toBe(true);
    if (r.success) expect(isGraphFlow(r.data)).toBe(true);
  });

  it("rejects a `needs` edge declared OUTSIDE the per-item band", () => {
    // The postlude `review` step gets a needs edge -> out of band -> rejected.
    const r = flowDefinitionSchema.safeParse(
      checklistGraphFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
          { id: "micro-plan", label: "Micro-plan", kind: "agent-turn", seat: "planner", outputs: ["micro-plan"] },
          { id: "implement", label: "Implement", kind: "agent-turn", seat: "implementer", needs: ["micro-plan"], outputs: ["execution"] },
          { id: "review", label: "Review", kind: "review-turn", seat: "reviewer", needs: ["implement"], outputs: ["review-decision"] },
        ],
        segment: { from: "micro-plan", to: "implement" },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a band step that depends on an out-of-band (prelude) step", () => {
    const r = flowDefinitionSchema.safeParse(
      checklistGraphFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
          { id: "micro-plan", label: "Micro-plan", kind: "agent-turn", seat: "planner", outputs: ["micro-plan"] },
          // `a` is in the band but depends on the prelude `plan` -> rejected
          // (prelude artifacts are carried via inputs, not needs).
          { id: "a", label: "A", kind: "agent-turn", seat: "reviewer", needs: ["plan"], outputs: ["analysis-a"] },
          { id: "implement", label: "Implement", kind: "agent-turn", seat: "implementer", needs: ["a"], outputs: ["execution"] },
        ],
        segment: { from: "micro-plan", to: "implement" },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a review-turn inside the per-item band (per-item arbitration deferred)", () => {
    const r = flowDefinitionSchema.safeParse(
      checklistGraphFlow({
        steps: [
          { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
          { id: "micro-plan", label: "Micro-plan", kind: "agent-turn", seat: "planner", outputs: ["micro-plan"] },
          // A review-turn inside the band -> rejected (ledger would collide per item).
          { id: "item-review", label: "Item review", kind: "review-turn", seat: "reviewer", needs: ["micro-plan"], outputs: ["findings"] },
          { id: "implement", label: "Implement", kind: "agent-turn", seat: "implementer", needs: ["item-review"], outputs: ["execution"] },
        ],
        segment: { from: "micro-plan", to: "implement" },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("band-scoped grouping: linear empty-needs prelude/postlude don't count toward the fan-out cap", () => {
    // Many linear steps with no needs would trip a GLOBAL empty-key group, but
    // they are outside the band, so band-scoped grouping ignores them.
    const linearPrelude = Array.from({ length: MAX_PARALLEL_FANOUT + 2 }, (_, i) => ({
      id: `pre${i}`,
      label: `Pre${i}`,
      kind: "agent-turn",
      seat: "planner",
      outputs: [`pre-${i}`],
    }));
    const r = flowDefinitionSchema.safeParse(
      checklistGraphFlow({
        steps: [
          ...linearPrelude,
          { id: "micro-plan", label: "Micro-plan", kind: "agent-turn", seat: "planner", outputs: ["micro-plan"] },
          { id: "a", label: "A", kind: "agent-turn", seat: "reviewer", needs: ["micro-plan"], outputs: ["analysis-a"] },
          { id: "implement", label: "Implement", kind: "agent-turn", seat: "implementer", needs: ["a"], outputs: ["execution"] },
        ],
        segment: { from: "micro-plan", to: "implement" },
      }),
    );
    expect(r.success).toBe(true);
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
