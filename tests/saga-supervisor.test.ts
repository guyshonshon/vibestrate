import { describe, it, expect } from "vitest";
import {
  parseSupervisorDecision,
  effectiveSupervisorDecision,
  parseNewInvariants,
  appendInvariants,
  buildSupervisorPrompt,
  renderInvariantsSection,
  MAX_INVARIANTS,
  MAX_INVARIANT_CHARS,
} from "../src/feature/supervisor.js";

describe("supervisor decision parse", () => {
  it("reads a strict DECISION line (PROCEED / ENHANCE / ESCALATE)", () => {
    expect(parseSupervisorDecision("blah\nDECISION: PROCEED\n").decision).toBe("PROCEED");
    expect(parseSupervisorDecision("DECISION: ENHANCE").decision).toBe("ENHANCE");
    expect(parseSupervisorDecision("DECISION: ESCALATE\nreport...").decision).toBe("ESCALATE");
  });

  it("takes the LAST keyword when there is no strict line (lenient fallback)", () => {
    // A cheap model may not emit the exact line; fall back to the last keyword.
    const r = parseSupervisorDecision("I considered PROCEED but we must ESCALATE here.");
    expect(r.decision).toBe("ESCALATE");
  });

  it("defaults to PROCEED with a reason when nothing parses (advisory, not fail-stop)", () => {
    // The per-item review already fail-closes correctness; a malformed supervisor
    // turn must NOT spuriously halt an otherwise-passing saga. It proceeds + logs.
    const r = parseSupervisorDecision("the weather is nice");
    expect(r.decision).toBeNull();
    expect(r.reason).toBeTruthy();
    expect(effectiveSupervisorDecision("the weather is nice")).toBe("PROCEED");
  });

  it("folds ENHANCE to PROCEED for control flow (Phase 3 reserves ENHANCE)", () => {
    expect(effectiveSupervisorDecision("DECISION: ENHANCE")).toBe("PROCEED");
    expect(effectiveSupervisorDecision("DECISION: ESCALATE")).toBe("ESCALATE");
    expect(effectiveSupervisorDecision("DECISION: PROCEED")).toBe("PROCEED");
  });
});

describe("invariants extraction + accumulation", () => {
  it("extracts INVARIANT: lines and redacts secrets in them", () => {
    const out = parseNewInvariants(
      "DECISION: PROCEED\nINVARIANT: all API responses use snake_case\nINVARIANT: auth token is AKIAIOSFODNN7EXAMPLE\n",
    );
    expect(out).toContain("all API responses use snake_case");
    // The token shape must be redacted, never carried verbatim into the ledger.
    expect(out.join("\n")).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("appends, dedupes (case/space-insensitive), and bounds the ledger", () => {
    const start = ["all API responses use snake_case"];
    const next = appendInvariants(start, [
      "All API Responses Use Snake_Case", // dup (normalized)
      "errors return RFC7807",
    ]);
    expect(next).toEqual([
      "all API responses use snake_case",
      "errors return RFC7807",
    ]);
  });

  it("caps total count and per-invariant length (re-injected every step)", () => {
    const many = Array.from({ length: MAX_INVARIANTS + 10 }, (_, i) => `rule number ${i}`);
    const capped = appendInvariants([], many);
    expect(capped.length).toBe(MAX_INVARIANTS);
    const long = appendInvariants([], ["x".repeat(MAX_INVARIANT_CHARS + 500)]);
    expect(long[0]!.length).toBeLessThanOrEqual(MAX_INVARIANT_CHARS + 1);
  });
});

describe("supervisor prompt + invariants section", () => {
  it("prompt grounds goal, remaining steps, and current invariants, redacted", () => {
    const prompt = buildSupervisorPrompt({
      goal: "Build the export pipeline",
      lastStep: { text: "add the CSV writer", outcomeSummary: "wrote csv-writer.ts" },
      diffSoFar: "diff --git a/x b/x\n+token=AKIAIOSFODNN7EXAMPLE",
      remainingSteps: ["add the JSON writer", "wire the CLI flag"],
      invariants: ["all API responses use snake_case"],
    });
    expect(prompt).toContain("Build the export pipeline");
    expect(prompt).toContain("add the JSON writer");
    expect(prompt).toContain("all API responses use snake_case");
    expect(prompt).toContain("DECISION:"); // tells the model the output contract
    expect(prompt).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("renders an Invariants section, empty -> empty string", () => {
    expect(renderInvariantsSection([])).toBe("");
    const sec = renderInvariantsSection(["all API responses use snake_case"]);
    expect(sec).toContain("Invariants");
    expect(sec).toContain("all API responses use snake_case");
  });
});
