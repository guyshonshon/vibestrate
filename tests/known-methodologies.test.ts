import { describe, it, expect } from "vitest";
import {
  resolveMethodology,
  renderMethodologyForPrompt,
  KNOWN_METHODOLOGY_IDS,
  KNOWN_METHODOLOGIES,
} from "../src/core/context/known-methodologies.js";

describe("resolveMethodology", () => {
  it("resolves the known ids, case- and whitespace-insensitively", () => {
    expect(resolveMethodology("tdd")?.id).toBe("tdd");
    expect(resolveMethodology(" TDD ")?.id).toBe("tdd");
    expect(resolveMethodology("Incremental")?.id).toBe("incremental");
    expect(resolveMethodology("bdd")?.label).toBe("Behavior-Driven Development");
  });

  it("returns null for unset / empty / unknown values", () => {
    expect(resolveMethodology(null)).toBeNull();
    expect(resolveMethodology(undefined)).toBeNull();
    expect(resolveMethodology("")).toBeNull();
    expect(resolveMethodology("waterfall")).toBeNull();
  });

  it("exposes exactly the catalog ids", () => {
    expect(KNOWN_METHODOLOGY_IDS.sort()).toEqual(["bdd", "incremental", "tdd"]);
    for (const id of KNOWN_METHODOLOGY_IDS) {
      expect(KNOWN_METHODOLOGIES[id]!.guidance.length).toBeGreaterThan(20);
    }
  });
});

describe("renderMethodologyForPrompt", () => {
  it("renders one bounded block for a known methodology", () => {
    const out = renderMethodologyForPrompt("tdd");
    expect(out).toContain("# Methodology");
    expect(out).toContain("Test-Driven Development");
    expect(out).toContain("red -> green -> refactor");
    // bounded: only the selected methodology, not the whole catalog
    expect(out).not.toContain("Behavior-Driven Development");
  });

  it("renders nothing for unset / unknown (no section)", () => {
    expect(renderMethodologyForPrompt(null)).toBe("");
    expect(renderMethodologyForPrompt("waterfall")).toBe("");
  });
});
