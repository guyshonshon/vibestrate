import { describe, it, expect } from "vitest";
import {
  projectPolicySchema,
  personaConfigSchema,
} from "../src/project/config-schema.js";

// Policy consolidation (docs/design/policy-consolidation.md): the persona-scoped
// `preferenceSchema` becomes the project-scoped `projectPolicySchema` with
// `tier` (was `severity`) and `matcher` (was `pattern`).
describe("projectPolicySchema", () => {
  it("defaults a bare rule to the advise tier with null matcher", () => {
    const p = projectPolicySchema.parse({ id: "no-em-dash", statement: "no em-dash" });
    expect(p.tier).toBe("advise");
    expect(p.matcher).toBeNull();
    expect(p.correction).toBeNull();
    expect(p.source).toBe("owner");
    expect(p.confirmedAt).toBeNull();
    expect(p.scope.lenses).toEqual([]);
  });

  it("accepts a block rule with a compilable matcher", () => {
    const p = projectPolicySchema.parse({
      id: "no-eyebrow",
      statement: "no eyebrow labels",
      tier: "block",
      matcher: "SectionEyebrow",
    });
    expect(p.tier).toBe("block");
    expect(p.matcher).toBe("SectionEyebrow");
  });

  it("rejects a block rule with no matcher (fail fast at write time)", () => {
    const r = projectPolicySchema.safeParse({
      id: "x",
      statement: "y",
      tier: "block",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a block rule whose matcher does not compile", () => {
    const r = projectPolicySchema.safeParse({
      id: "x",
      statement: "y",
      tier: "block",
      matcher: "(",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-empty scope.lenses on a block rule (silent no-op footgun)", () => {
    const r = projectPolicySchema.safeParse({
      id: "x",
      statement: "y",
      tier: "block",
      matcher: "foo",
      scope: { lenses: ["security"] },
    });
    expect(r.success).toBe(false);
  });

  it("allows scope.lenses on an advise rule (the targeting refinement)", () => {
    const p = projectPolicySchema.parse({
      id: "x",
      statement: "y",
      scope: { lenses: ["security"] },
    });
    expect(p.scope.lenses).toEqual(["security"]);
  });
});

describe("personaConfigSchema after consolidation", () => {
  it("no longer accepts a persona-scoped preferences array (strict)", () => {
    const r = personaConfigSchema.safeParse({
      label: "X",
      preferences: [{ id: "a", statement: "b" }],
    });
    expect(r.success).toBe(false);
  });
});
