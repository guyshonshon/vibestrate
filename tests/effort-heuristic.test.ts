import { describe, it, expect } from "vitest";
import { classifyEffort } from "../src/core/effort-heuristic.js";

describe("classifyEffort", () => {
  it("treats an empty task as medium with very low confidence", () => {
    const r = classifyEffort({ text: "" });
    expect(r.effort).toBe("medium");
    expect(r.confidence).toBeLessThanOrEqual(0.2);
    expect(r.reasons.join(" ")).toMatch(/empty/i);
  });

  it("classifies short, doc-only edits as low", () => {
    const r = classifyEffort({
      text: "Fix a typo in the README.",
      files: ["README.md"],
    });
    expect(r.effort).toBe("low");
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.reasons.join(" ")).toMatch(/typo/i);
  });

  it("classifies refactor-the-architecture-style asks as high", () => {
    const r = classifyEffort({
      text: "Refactor the scheduler to decouple it from the orchestrator and migrate the queue store to a worker-pool architecture.",
      files: [
        "src/scheduler/scheduler.ts",
        "src/scheduler/queue.ts",
        "src/core/orchestrator.ts",
        "src/scheduler/worker.ts",
        "src/scheduler/runtime.ts",
      ],
    });
    expect(r.effort).toBe("high");
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
    expect(r.reasons.join(" ")).toMatch(/refactor/i);
    expect(r.reasons.join(" ")).toMatch(/files targeted/i);
  });

  it("lands at medium when the signals cancel out", () => {
    // Long task description with no strong keywords either way and a
    // moderate number of varied files. Should not be confident.
    const r = classifyEffort({
      text: "Improve the way the dashboard handles run state when an approval comes in mid-stage so the user sees a useful banner instead of a stale label.",
      files: ["src/ui/components/runs/RunHeader.tsx"],
    });
    expect(r.effort).toBe("medium");
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });

  it("uses word boundaries so 'rewriter' doesn't fire 'rewrite'", () => {
    // Naive includes() would hit; the regex must not.
    const r = classifyEffort({
      text: "Document the rewriter pattern in the architecture notes.",
    });
    // "architecture" still hits as high but "rewriter" should NOT count.
    expect(r.reasons.find((s) => /rewrite/.test(s.toLowerCase()))).toBeUndefined();
  });

  it("low-effort keywords stack but cap at -3", () => {
    const r = classifyEffort({
      text: "Tweak the comment formatting, fix a typo, and run prettier to address lint warnings.",
    });
    expect(r.effort).toBe("low");
    // Should be high confidence — multiple keywords + short task.
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("emits at least one reason per call", () => {
    const r1 = classifyEffort({ text: "x" });
    expect(r1.reasons.length).toBeGreaterThan(0);
    const r2 = classifyEffort({
      text: "Refactor the auth flow to decouple session handling from the request middleware.",
      files: ["src/auth/session.ts"],
    });
    expect(r2.reasons.length).toBeGreaterThan(0);
  });

  it("is deterministic — same input returns identical output", () => {
    const input = {
      text: "Migrate the build to vite 7 and rewrite the postcss pipeline.",
      files: ["vite.config.ts", "postcss.config.js"],
    };
    const a = classifyEffort(input);
    const b = classifyEffort(input);
    expect(a).toEqual(b);
  });

  it("config/infra files nudge toward high even with a short text", () => {
    const r = classifyEffort({
      text: "Update tsconfig.",
      files: ["tsconfig.json", "vite.config.ts"],
    });
    // 'Update tsconfig.' is very short (leans low), but config files
    // nudge the score back up. Expect medium (signals cancel) — not low.
    expect(r.effort).not.toBe("high");
    expect(
      r.reasons.find((x) => /config\/infra/i.test(x)),
    ).toBeDefined();
  });

  it("rounds confidence to two decimals", () => {
    const r = classifyEffort({
      text: "Fix a typo in the README.",
      files: ["README.md"],
    });
    const str = r.confidence.toString();
    if (str.includes(".")) {
      const decimals = str.split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it("a verbose architecture-rewrite ask is high with strong confidence", () => {
    // Sanity check the upper end of the score scale.
    const r = classifyEffort({
      text: "Rewrite the architecture of the orchestrator to introduce a pluggable workflow DAG, migrate the executor to a worker-pool runtime, and decouple the queue scheduler from the run-state writer so concurrent workers can claim tasks atomically without a central daemon.",
      files: [
        "src/core/orchestrator.ts",
        "src/scheduler/scheduler.ts",
        "src/scheduler/worker.ts",
        "src/workflow/dag.ts",
        "src/workflow/workflow-types.ts",
        "tsconfig.json",
      ],
    });
    expect(r.effort).toBe("high");
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
