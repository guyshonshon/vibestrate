import { describe, it, expect } from "vitest";
import { splitLanes } from "../src/ui/app/routes/run-detail/AssuranceBadge.js";

/**
 * The assurance card shows findings, not a symmetrical grid.
 *
 * The grid spent the same 104x142px on `passed` as on the gate that stopped
 * the run, and the one cell with something to say wrapped to four lines. This
 * pins the split that replaced it.
 */
describe("gates split into findings and confirmations", () => {
  it("a cleared gate is never a finding", () => {
    const r = splitLanes([{ lane: "Policy", status: "passed" }]);
    expect(r.findings).toHaveLength(0);
    expect(r.clearedSentence).toBe("Policy passed.");
  });

  it("not-applicable is a confirmation, not a failure", () => {
    // "Verification did not run" on a flow with no verify step is honest, and
    // rendering it as a finding would invent a problem.
    for (const status of ["not_applicable", "not_required", "not_run", "skipped"]) {
      expect(splitLanes([{ lane: "Verification", status }]).findings).toHaveLength(0);
    }
  });

  it("separates a refusal from a gap in the evidence", () => {
    const { findings } = splitLanes([
      { lane: "Review", status: "changes_requested" },
      { lane: "Validation", status: "environment", detail: "toolchain missing" },
    ]);
    // A reviewer refusing is a verdict; a missing toolchain is "we could not
    // tell". They must not read the same.
    expect(findings.find((f) => f.lane === "Review")?.severe).toBe(true);
    expect(findings.find((f) => f.lane === "Validation")?.severe).toBe(false);
  });

  it("reads the confirmations as one sentence, not four cells", () => {
    const r = splitLanes([
      { lane: "Policy", status: "passed" },
      { lane: "Verification", status: "not_run" },
    ]);
    expect(r.clearedSentence).toBe("Policy passed and verification not run.");
  });

  it("the real blocked run: two findings, two confirmations", () => {
    const r = splitLanes([
      { lane: "Policy", status: "passed" },
      { lane: "Validation", status: "environment", detail: "The toolchain was missing." },
      { lane: "Review", status: "changes_requested" },
      { lane: "Verification", status: "not_run" },
    ]);
    expect(r.findings.map((f) => f.lane)).toEqual(["Validation", "Review"]);
    expect(r.cleared).toHaveLength(2);
  });
});
