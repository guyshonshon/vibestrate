import { describe, expect, it } from "vitest";
import { deriveEngagement } from "../src/core/run-engagement.js";
import type { VibestrateEvent } from "../src/core/event-log.js";

const ts = "2026-06-08T00:00:00.000Z";

function ev(type: string, data: Record<string, unknown>, message = ""): VibestrateEvent {
  return { timestamp: ts, type: type as VibestrateEvent["type"], message, data };
}

describe("deriveEngagement", () => {
  it("classifies selection, verdicts, gates, fan-out, and resilience; preserves order", () => {
    const events: VibestrateEvent[] = [
      ev("workflow.selected", { flowId: "panel-review", confidence: "medium", risks: ["auth"] }),
      ev("flow.step.started", { stepId: "plan" }), // ignored (structure on node)
      ev("flow.step.retried", { stepId: "plan", attempt: 1, class: "rate-limit" }), // ignored (node attempt chain)
      ev("flow.frontier.scheduled", { stepIds: ["r1", "r2", "r3"], width: 3 }),
      ev("provider.fallback", { stepId: "r2", ok: true, fallbackProfile: "cheap", class: "rate-limit" }),
      ev("review.decision", { stepId: "arbiter", decision: "CHANGES_REQUESTED" }),
      ev("action.denied", { stepId: "impl", kind: "agent.turn.diff", verdict: "rolled back" }),
      ev("budget.limit", { onLimit: "pause", kind: "daily turns", resolved: "approved" }),
      ev("verification.decision", { stepId: "verify", decision: "FAILED" }),
    ];

    const out = deriveEngagement(events);
    const types = out.map((e) => e.type);
    // The two ignored low-signal events are dropped.
    expect(types).toEqual([
      "workflow.selected",
      "flow.frontier.scheduled",
      "provider.fallback",
      "review.decision",
      "action.denied",
      "budget.limit",
      "verification.decision",
    ]);
    // seq is contiguous over the kept entries, in stream order.
    expect(out.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const sel = out[0]!;
    expect(sel.cls).toBe("judgment");
    expect(sel.anchor).toBe("root");
    expect(sel.title).toBe("selected panel-review");
    expect(sel.detail).toContain("confidence medium");
    expect(sel.detail).toContain("1 risk");

    const fan = out[1]!;
    expect(fan.cls).toBe("structural");
    expect(fan.anchor).toBe("fanout");
    expect(fan.title).toBe("fanned out ×3");

    const fb = out[2]!;
    expect(fb.cls).toBe("enforced");
    expect(fb.stepId).toBe("r2");
    expect(fb.title).toContain("→ cheap");

    const review = out[3]!;
    expect(review.cls).toBe("judgment");
    expect(review.tone).toBe("warn"); // CHANGES_REQUESTED
    expect(review.stepId).toBe("arbiter");

    const denied = out[4]!;
    expect(denied.cls).toBe("enforced");
    expect(denied.tone).toBe("bad");
    expect(denied.stepId).toBe("impl");

    const budget = out[5]!;
    expect(budget.cls).toBe("enforced");
    expect(budget.anchor).toBe("run");
    expect(budget.tone).toBe("warn"); // resolved=approved (continued)

    const verify = out[6]!;
    expect(verify.cls).toBe("judgment");
    expect(verify.tone).toBe("bad"); // FAILED
  });

  it("anchors approval/policy to a step when the event carries a stage id", () => {
    const out = deriveEngagement([
      ev("approval.requested", { stageId: "impl", source: "policy", reason: "diff touches src/security" }),
      ev("policy.warning", { stageId: "impl", kind: "read-only" }),
    ]);
    expect(out[0]!.anchor).toBe("step");
    expect(out[0]!.stepId).toBe("impl");
    expect(out[0]!.cls).toBe("enforced");
    expect(out[1]!.title).toContain("policy");
  });

  it("surfaces isolation posture honestly (sandboxed, hardened, requested-but-unavailable)", () => {
    const out = deriveEngagement([
      ev("provider.sandboxed", { stageId: "implement", provider: "codex", mode: "workspace-write" }),
      ev("provider.sandbox_unavailable", { stageId: "review", provider: "claude", requested: "read-only" }),
      ev("provider.hardened", { stageId: "verify", provider: "claude", mode: "plan" }),
    ]);
    expect(out).toHaveLength(3);
    // Applied OS sandbox: positive, anchored on the step, names the real mode.
    expect(out[0]!.cls).toBe("enforced");
    expect(out[0]!.tone).toBe("info");
    expect(out[0]!.stepId).toBe("implement");
    expect(out[0]!.title).toContain("workspace-write");
    expect(out[0]!.detail).toBe("codex");
    // Requested but unavailable: a warning, never dressed up as sandboxed.
    expect(out[1]!.tone).toBe("warn");
    expect(out[1]!.title).toBe("sandbox unavailable");
    expect(out[1]!.detail).toBe("claude");
    // claude plan-mode hardening: positive, distinct from the OS sandbox.
    expect(out[2]!.tone).toBe("info");
    expect(out[2]!.title).toContain("hardened");
    expect(out[2]!.detail).toBe("claude");
  });

  it("returns an empty list when nothing supervisory happened", () => {
    expect(
      deriveEngagement([ev("flow.step.started", { stepId: "x" }), ev("flow.step.completed", { stepId: "x" })]),
    ).toEqual([]);
  });

  it("surfaces resilience terminal moments: retries exhausted and usage-limit give-up", () => {
    const out = deriveEngagement([
      ev("provider.retries_exhausted", {
        stepId: "implement",
        class: "rate-limit",
        retries: 5,
        detail: "429 too many requests",
      }),
      ev("provider.usage_limit", {
        stepId: "implement",
        action: "stop",
        resolved: "give-up",
        detail: "This model is being rate limited",
      }),
      // A wait is a warn, not a terminal failure.
      ev("provider.usage_limit", { stepId: "implement", action: "wait", waitMs: 60000 }),
    ]);
    expect(out).toHaveLength(3);

    const exhausted = out[0]!;
    expect(exhausted.cls).toBe("enforced");
    expect(exhausted.tone).toBe("bad");
    expect(exhausted.stepId).toBe("implement");
    expect(exhausted.title).toContain("rate-limit");
    expect(exhausted.detail).toContain("429");

    const gaveUp = out[1]!;
    expect(gaveUp.tone).toBe("bad");
    expect(gaveUp.title).toContain("gave up");
    expect(gaveUp.detail).toContain("rate limited");

    const waiting = out[2]!;
    expect(waiting.tone).toBe("warn");
    expect(waiting.title).toContain("wait");
  });
});
