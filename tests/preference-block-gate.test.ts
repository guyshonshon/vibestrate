import { describe, it, expect } from "vitest";
import { personaConfigSchema, type PersonaPreference } from "../src/project/config-schema.js";
import { evaluateBlockPreferences } from "../src/orchestrator/preference-block-gate.js";

function pref(over: Partial<PersonaPreference> = {}): PersonaPreference {
  return {
    id: "no-em-dash",
    statement: "do not use em-dash characters",
    correction: null,
    scope: { lenses: [] },
    source: "owner",
    confirmedAt: "2026-06-28T00:00:00.000Z",
    severity: "block",
    pattern: "—", // em-dash
    ...over,
  };
}

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "+++ b/src/a.ts",
  "+const note = `done — shipped`;", // added line with an em-dash
  " const untouched = 1;", // context line - must NOT match
  "diff --git a/.env b/.env",
  "+++ b/.env",
  "+SECRET=—value—", // em-dash inside a secret-like file - must be skipped
].join("\n");

describe("preference block gate - schema (severity + pattern)", () => {
  it("defaults severity to advise and pattern to null", () => {
    const p = personaConfigSchema.parse({
      label: "P",
      preferences: [{ id: "x", statement: "a rule" }],
    });
    expect(p.preferences[0]!.severity).toBe("advise");
    expect(p.preferences[0]!.pattern).toBeNull();
  });

  it("rejects a block preference with no pattern (a hard gate needs a matcher)", () => {
    const r = personaConfigSchema.safeParse({
      label: "P",
      preferences: [{ id: "x", statement: "a rule", severity: "block" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a pattern that is not a valid regex", () => {
    const r = personaConfigSchema.safeParse({
      label: "P",
      preferences: [{ id: "x", statement: "a rule", severity: "block", pattern: "(" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a block preference with a valid pattern", () => {
    const r = personaConfigSchema.safeParse({
      label: "P",
      preferences: [{ id: "x", statement: "a rule", severity: "block", pattern: "—" }],
    });
    expect(r.success).toBe(true);
  });
});

describe("preference block gate - evaluateBlockPreferences", () => {
  it("flags a block preference whose pattern matches an added line", () => {
    const r = evaluateBlockPreferences([pref()], DIFF);
    expect(r.clean).toBe(false);
    expect(r.violations.map((v) => v.id)).toEqual(["no-em-dash"]);
    expect(r.violations[0]!.file).toBe("src/a.ts");
  });

  it("an ADVISE preference never caps the merge (even if it would match)", () => {
    expect(evaluateBlockPreferences([pref({ severity: "advise" })], DIFF).clean).toBe(true);
  });

  it("an UNCONFIRMED block preference is inert (trust gate)", () => {
    expect(evaluateBlockPreferences([pref({ confirmedAt: null })], DIFF).clean).toBe(true);
  });

  it("does not match content/context lines, only added lines", () => {
    const onlyContext = " const note = `done — shipped`;\n const x = 1;";
    expect(evaluateBlockPreferences([pref()], onlyContext).clean).toBe(true);
  });

  it("skips secret-like files (a match inside .env does not count)", () => {
    const envOnly = ["+++ b/.env", "+SECRET=—value—"].join("\n");
    expect(evaluateBlockPreferences([pref()], envOnly).clean).toBe(true);
  });

  it("a non-compiling pattern is inert (fail-open), not a crash or a violation", () => {
    const r = evaluateBlockPreferences([pref({ id: "bad", pattern: "(" })], DIFF);
    expect(r.clean).toBe(true);
    expect(r.inert.map((i) => i.id)).toContain("bad");
  });

  it("clean when nothing matches", () => {
    const r = evaluateBlockPreferences([pref({ pattern: "ZZZ_nope" })], DIFF);
    expect(r.clean).toBe(true);
    expect(r.violations).toEqual([]);
  });
});
