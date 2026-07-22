import { describe, it, expect } from "vitest";
import {
  initRunBrief,
  appendStepOutcome,
  updateRunBriefFacts,
  renderRunBrief,
  setCarriedHandoff,
} from "../src/core/run/run-brief.js";
import type { WorkflowSelection } from "../src/supervisor/select-workflow.js";

const selection: WorkflowSelection = {
  flowId: "quality-arbitration",
  crewId: null,
  source: "selected",
  confidence: "high",
  reasons: ["security-sensitive auth change"],
  risks: ["touches auth middleware"],
  posture: "normal",
  advisory: null,
};

describe("run brief", () => {
  it("is empty before any step completes", () => {
    const s = initRunBrief({ task: "Add OAuth", selection });
    expect(renderRunBrief(s)).toBe("");
  });

  it("seeds from the selection and accumulates step decisions", () => {
    const s = initRunBrief({ task: "Add OAuth", selection });
    appendStepOutcome(s, { stepId: "plan", label: "Plan", kind: "agent-turn", output: "Plan: add an oauth route and a callback handler." });
    appendStepOutcome(s, { stepId: "review", label: "Review", kind: "review-turn", output: "Looks good.", decision: "APPROVED" });
    updateRunBriefFacts(s, { validation: { total: 3, passed: 3, failed: 0 } });

    const brief = renderRunBrief(s);
    expect(brief).toContain("Run brief (the story so far)");
    expect(brief).toContain("quality-arbitration");
    expect(brief).toContain("Plan");
    expect(brief).toContain("[APPROVED]");
    expect(brief).toContain("3/3 passed");
    expect(brief).toContain("touches auth middleware"); // risk carried from selection
  });

  it("folds the oldest steps when over the byte budget", () => {
    const s = initRunBrief({ task: "Big task", selection: null });
    for (let i = 0; i < 8; i++) {
      appendStepOutcome(s, {
        stepId: `step-${i}`,
        label: `Step ${i}`,
        kind: "agent-turn",
        output: "x".repeat(300), // long summary so the full form is bulky
      });
    }
    const budget = 600;
    const brief = renderRunBrief(s, budget);
    // Bounded (allow a little header overhead, like the item ledger).
    expect(brief.length).toBeLessThan(budget + 400);
    // The newest step keeps its summary line; an older one is folded (no summary).
    expect(brief).toContain("Step 7");
  });

  it("renders validation + files facts when present", () => {
    const s = initRunBrief({ task: "t", selection: null });
    appendStepOutcome(s, { stepId: "a", label: "A", kind: "agent-turn", output: "did a thing" });
    updateRunBriefFacts(s, { validation: { total: 2, passed: 1, failed: 1 }, filesChanged: 4 });
    const brief = renderRunBrief(s);
    expect(brief).toContain("1/2 passed, 1 failed");
    expect(brief).toContain("Files changed: 4");
  });

  it("a carried handoff renders even before any step completes (first resumed turn)", () => {
    const s = initRunBrief({ task: "t", selection: null });
    setCarriedHandoff(s, {
      sourceRunId: "noble-darwin",
      fromStage: "reviewing",
      lines: ["Decision (merge-ready): chose worktree isolation", "Risk: concurrency untested"],
    });
    const brief = renderRunBrief(s);
    expect(brief).toContain("## Carried from run noble-darwin (resumed at reviewing)");
    expect(brief).toContain("- Decision (merge-ready): chose worktree isolation");
    expect(brief).toContain("- Risk: concurrency untested");
    expect(brief).not.toContain("## Steps so far"); // no live steps yet
  });

  it("empty carried lines keep the brief empty (no header-only section)", () => {
    const s = initRunBrief({ task: "t", selection: null });
    setCarriedHandoff(s, { sourceRunId: "x", fromStage: "fixing", lines: [] });
    expect(renderRunBrief(s)).toBe("");
  });

  it("carried renders before steps and survives the budget fold", () => {
    const s = initRunBrief({ task: "t", selection: null });
    setCarriedHandoff(s, {
      sourceRunId: "src-run",
      fromStage: "fixing",
      lines: ["Decision (changes-requested): tighten input validation"],
    });
    for (let i = 0; i < 8; i++) {
      appendStepOutcome(s, { stepId: `s${i}`, label: `Step ${i}`, kind: "agent-turn", output: "y".repeat(300) });
    }
    const brief = renderRunBrief(s, 600);
    const carriedAt = brief.indexOf("## Carried from run src-run");
    const stepsAt = brief.indexOf("## Steps so far");
    expect(carriedAt).toBeGreaterThan(-1);
    expect(stepsAt).toBeGreaterThan(carriedAt);
    // The fold compresses step outcomes, never the carried rationale.
    expect(brief).toContain("tighten input validation");
  });
});
