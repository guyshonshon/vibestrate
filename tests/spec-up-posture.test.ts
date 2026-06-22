import { describe, it, expect } from "vitest";
import {
  SPEC_UP_FLOW_IDS,
  isSpecUpFlow,
  renderSpecUpPostureBlock,
} from "../src/spec-up/spec-up-posture.js";
import { BUILTIN_PERSONAS } from "../src/orchestrator/personas.js";

describe("spec-up-posture - isSpecUpFlow", () => {
  it("is true for the three spec-up phase flow ids", () => {
    expect(isSpecUpFlow("spec-up-intake")).toBe(true);
    expect(isSpecUpFlow("spec-up")).toBe(true);
    expect(isSpecUpFlow("spec-up-roadmap")).toBe(true);
    expect([...SPEC_UP_FLOW_IDS].sort()).toEqual(["spec-up", "spec-up-intake", "spec-up-roadmap"]);
  });

  it("is false for non-spec-up flows and null/undefined", () => {
    expect(isSpecUpFlow("default")).toBe(false);
    expect(isSpecUpFlow("panel-review")).toBe(false);
    expect(isSpecUpFlow(null)).toBe(false);
    expect(isSpecUpFlow(undefined)).toBe(false);
  });
});

describe("spec-up-posture - renderSpecUpPostureBlock", () => {
  it("wraps a non-empty posture in a labelled block carrying the posture text", () => {
    const r = renderSpecUpPostureBlock("You are the CTO; threat-model the scope.");
    expect(r).not.toBeNull();
    expect(r).toContain("You are the CTO; threat-model the scope.");
    expect(r!.toLowerCase()).toContain("spec-up posture");
  });

  it("returns null for empty/whitespace/null (nothing injected, runs unchanged)", () => {
    expect(renderSpecUpPostureBlock("")).toBeNull();
    expect(renderSpecUpPostureBlock("   ")).toBeNull();
    expect(renderSpecUpPostureBlock(null)).toBeNull();
    expect(renderSpecUpPostureBlock(undefined)).toBeNull();
  });

  it("BEHAVIORAL: the default persona injects nothing; security aims the spec-up phase", () => {
    // The default staff-engineer stays posture-neutral (plain spec-up runs unchanged);
    // security carries a posture, so switching persona changes the spec-up prompt.
    expect(renderSpecUpPostureBlock(BUILTIN_PERSONAS["staff-engineer"]!.specUpPosture)).toBeNull();
    const sec = renderSpecUpPostureBlock(BUILTIN_PERSONAS["security"]!.specUpPosture);
    expect(sec).not.toBeNull();
  });
});
