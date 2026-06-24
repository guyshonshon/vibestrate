import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { AuditView } from "../src/shell/ink/pages/RunsPage.js";
import type { RunAudit, AuditStep } from "../src/core/run-audit.js";

function step(
  over: Partial<AuditStep> & { id: string; label: string },
): AuditStep {
  return {
    kind: "turn",
    seat: null,
    status: "passed",
    stage: "executing",
    roleId: null,
    roleLabel: null,
    profileId: null,
    needs: [],
    provider: null,
    model: null,
    costUsd: null,
    durationMs: null,
    tokensIn: null,
    tokensOut: null,
    toolCallCount: null,
    retries: 0,
    fellBack: false,
    decision: null,
    attempts: [],
    tools: [],
    subAgents: [],
    internalsOpaque: false,
    ...over,
  };
}

const audit: RunAudit = {
  schemaVersion: 1,
  runId: "bold-lovelace",
  task: "x",
  status: "merge_ready",
  flow: { id: "express", label: "Express" },
  assuranceVerdict: "verified",
  steps: [
    step({ id: "plan", label: "Plan", stage: "planning" }),
    step({ id: "build", label: "Build", stage: "executing", retries: 2 }),
    step({
      id: "verify",
      label: "Verify",
      stage: "verifying",
      fellBack: true,
      decision: "approved",
    }),
  ],
  control: [{ type: "budget", message: "daily cap reached" }],
  engagement: [],
  totals: { turns: 3, retries: 2, fallbacks: 1, costUsd: 0.12 },
};

function frame(a: RunAudit | null): string {
  const { lastFrame } = render(React.createElement(AuditView, { audit: a }));
  return lastFrame() ?? "";
}

describe("AuditView", () => {
  it("shows a deriving hint before the audit loads", () => {
    expect(frame(null)).toContain("deriving");
  });

  it("shows an empty-state hint when no steps are recorded", () => {
    expect(frame({ ...audit, steps: [] })).toContain("no steps recorded");
  });

  it("renders totals, each step, and its retry/fallback/decision markers", () => {
    const out = frame(audit);
    // Totals line.
    expect(out).toContain("3 turns");
    expect(out).toContain("2 retries");
    expect(out).toContain("1 fallback");
    expect(out).toContain("$0.12");
    // Steps.
    expect(out).toContain("Plan");
    expect(out).toContain("Build");
    expect(out).toContain("Verify");
    // Per-step markers.
    expect(out).toContain("↻2"); // build retried twice
    expect(out).toContain("fallback"); // verify fell back
    expect(out).toContain("approved"); // verify decision
    // Control events.
    expect(out).toContain("budget");
    expect(out).toContain("daily cap reached");
  });
});
