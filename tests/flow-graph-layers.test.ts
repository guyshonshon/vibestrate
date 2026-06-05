import { describe, it, expect } from "vitest";
import {
  layersOf,
  isGraphSteps,
  type FlowGraphStep,
} from "../src/ui/components/workflow/FlowGraph.js";

// The panel-review shape: plan -> implement -> validate -> {3 reviewers} -> arbiter.
const PANEL: FlowGraphStep[] = [
  { id: "plan", label: "Plan", kind: "agent-turn" },
  { id: "implement", label: "Implement", kind: "agent-turn", needs: ["plan"] },
  { id: "validate", label: "Validate", kind: "validation", needs: ["implement"] },
  { id: "rc", label: "Correctness", kind: "review-turn", needs: ["validate"] },
  { id: "rt", label: "Tests", kind: "review-turn", needs: ["validate"] },
  { id: "rr", label: "Risk", kind: "review-turn", needs: ["validate"] },
  { id: "arbiter", label: "Arbiter", kind: "review-turn", needs: ["rc", "rt", "rr"] },
];

describe("FlowGraph layering", () => {
  it("isGraphSteps detects a graph vs a linear flow", () => {
    expect(isGraphSteps(PANEL)).toBe(true);
    const linear: FlowGraphStep[] = [
      { id: "a", label: "A", kind: "agent-turn" },
    ];
    expect(isGraphSteps(linear)).toBe(false);
  });

  it("places the three reviewers on one layer (the parallel fan-out) and the arbiter alone after", () => {
    const layers = layersOf(PANEL);
    const ids = layers.map((l) => l.map((s) => s.id));
    expect(ids).toEqual([
      ["plan"],
      ["implement"],
      ["validate"],
      ["rc", "rt", "rr"],
      ["arbiter"],
    ]);
  });

  it("renders a linear flow as one node per layer", () => {
    const linear: FlowGraphStep[] = [
      { id: "a", label: "A", kind: "agent-turn" },
      { id: "b", label: "B", kind: "agent-turn", needs: ["a"] },
      { id: "c", label: "C", kind: "agent-turn", needs: ["b"] },
    ];
    expect(layersOf(linear).map((l) => l.length)).toEqual([1, 1, 1]);
  });

  it("uses the longest path so a late join sits below all its inputs", () => {
    // d needs a (layer 0) and c (layer 2) -> d must land at layer 3, not 1.
    const diamond: FlowGraphStep[] = [
      { id: "a", label: "A", kind: "agent-turn" },
      { id: "b", label: "B", kind: "agent-turn", needs: ["a"] },
      { id: "c", label: "C", kind: "agent-turn", needs: ["b"] },
      { id: "d", label: "D", kind: "review-turn", needs: ["a", "c"] },
    ];
    const layers = layersOf(diamond);
    const layerOf = (id: string) =>
      layers.findIndex((l) => l.some((s) => s.id === id));
    expect(layerOf("d")).toBe(3);
  });
});
