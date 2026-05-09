import { describe, it, expect } from "vitest";
import { detectApprovalRequest } from "../src/core/approval-types.js";

describe("detectApprovalRequest — structured fields", () => {
  it("required=false when no marker is present", () => {
    const r = detectApprovalRequest("Discussion of HUMAN_APPROVAL inline.");
    expect(r.required).toBe(false);
    expect(r.riskLevel).toBe("medium");
    expect(r.requestedAction).toBeNull();
  });

  it("required=true with marker only; defaults to medium risk and null requestedAction", () => {
    const r = detectApprovalRequest(
      "Some explanation\n\nHUMAN_APPROVAL: REQUIRED\n",
    );
    expect(r.required).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.riskLevel).toBe("medium");
    expect(r.requestedAction).toBeNull();
  });

  it("captures all four fields when present", () => {
    const r = detectApprovalRequest(
      [
        "HUMAN_APPROVAL: REQUIRED",
        "HUMAN_APPROVAL_REASON: touches the auth boundary",
        "HUMAN_APPROVAL_RISK: high",
        "HUMAN_APPROVAL_REQUEST: Approve switching session storage to server-side",
      ].join("\n"),
    );
    expect(r.required).toBe(true);
    expect(r.reason).toBe("touches the auth boundary");
    expect(r.riskLevel).toBe("high");
    expect(r.requestedAction).toBe(
      "Approve switching session storage to server-side",
    );
  });

  it("normalises the risk value (case-insensitive on the value)", () => {
    const r = detectApprovalRequest(
      "HUMAN_APPROVAL: REQUIRED\nHUMAN_APPROVAL_RISK: HIGH",
    );
    expect(r.riskLevel).toBe("high");
  });

  it("falls back to medium for invalid risk values", () => {
    const r = detectApprovalRequest(
      "HUMAN_APPROVAL: REQUIRED\nHUMAN_APPROVAL_RISK: spicy",
    );
    expect(r.riskLevel).toBe("medium");
  });

  it("ignores casual mentions inside prose without the explicit marker", () => {
    const r = detectApprovalRequest(
      "Note: in some cases a HUMAN_APPROVAL: REQUIRED-like signal would help, but I am not requesting one.",
    );
    // The marker must be on its own line. The prose contains "REQUIRED" mid-sentence,
    // so this should still NOT match.
    expect(r.required).toBe(false);
  });

  it("marker is case-sensitive (lowercase does not trigger)", () => {
    const r = detectApprovalRequest("human_approval: required\n");
    expect(r.required).toBe(false);
  });

  it("trims trailing whitespace on captured fields", () => {
    const r = detectApprovalRequest(
      [
        "HUMAN_APPROVAL: REQUIRED",
        "HUMAN_APPROVAL_REASON:    something with spaces   ",
        "HUMAN_APPROVAL_REQUEST:  Do the thing  ",
      ].join("\n"),
    );
    expect(r.reason).toBe("something with spaces");
    expect(r.requestedAction).toBe("Do the thing");
  });
});
