import { describe, it, expect } from "vitest";
import {
  inferFlowComplexity,
  flowComplexityAdvice,
} from "../src/flows/runtime/flow-complexity.js";
import {
  defaultFlow,
  pickupFlow,
  qualityArbitrationFlow,
} from "../src/flows/catalog/builtin-flows.js";

function steps(kinds: string[]) {
  return { steps: kinds.map((kind) => ({ kind })) };
}

describe("inferFlowComplexity", () => {
  it("honors a declared complexity over inference", () => {
    expect(
      inferFlowComplexity({ complexity: "low", ...steps(["agent-turn", "agent-turn", "agent-turn", "agent-turn", "agent-turn"]) }),
    ).toBe("low");
  });

  it("infers from agent-turn count when undeclared (≤2 low, 3–4 medium, ≥5 high)", () => {
    expect(inferFlowComplexity(steps(["agent-turn", "review-turn"]))).toBe("low");
    expect(
      inferFlowComplexity(steps(["agent-turn", "agent-turn", "review-turn"])),
    ).toBe("medium");
    expect(
      inferFlowComplexity(
        steps(["agent-turn", "agent-turn", "agent-turn", "review-turn", "summary-turn"]),
      ),
    ).toBe("high");
  });

  it("ignores non-turn steps (validation / approval-gate don't count)", () => {
    expect(
      inferFlowComplexity(
        steps(["agent-turn", "validation", "approval-gate", "review-turn"]),
      ),
    ).toBe("low"); // only 2 turns
  });

  it("the built-in flows declare sensible weights", () => {
    expect(inferFlowComplexity(defaultFlow)).toBe("high");
    expect(inferFlowComplexity(pickupFlow)).toBe("medium");
    expect(inferFlowComplexity(qualityArbitrationFlow)).toBe("high");
  });
});

describe("flowComplexityAdvice", () => {
  it("no advice when the flow matches or is lighter than the task", () => {
    expect(flowComplexityAdvice({ flowComplexity: "low", taskEffort: "low" }).level).toBe("none");
    expect(flowComplexityAdvice({ flowComplexity: "low", taskEffort: "high" }).level).toBe("none");
    expect(flowComplexityAdvice({ flowComplexity: "medium", taskEffort: "high" }).message).toBeNull();
  });

  it("a one-level gap is a gentle 'consider' note", () => {
    const a = flowComplexityAdvice({ flowComplexity: "high", taskEffort: "medium" });
    expect(a.level).toBe("consider");
    expect(a.gap).toBe(1);
    expect(a.message).toContain("a bit heavier");
  });

  it("a two-level gap is a strong 'overkill' warning", () => {
    const a = flowComplexityAdvice({
      flowComplexity: "high",
      taskEffort: "low",
      flowLabel: "Default",
    });
    expect(a.level).toBe("overkill");
    expect(a.gap).toBe(2);
    expect(a.message).toContain('"Default"');
    expect(a.message).toContain("might be too much");
  });

  it("uses a generic label when none is given", () => {
    const a = flowComplexityAdvice({ flowComplexity: "medium", taskEffort: "low" });
    expect(a.message).toContain("This flow");
  });
});
