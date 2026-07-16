import { describe, it, expect } from "vitest";
import {
  projectPolicySchema,
  type ProjectPolicy,
} from "../src/project/config-schema.js";
import { evaluateBlockPolicies } from "../src/supervisor/policy-block.js";

function policy(over: Partial<ProjectPolicy> = {}): ProjectPolicy {
  return {
    id: "no-em-dash",
    statement: "do not use em-dash characters",
    correction: null,
    scope: { lenses: [] },
    source: "owner",
    confirmedAt: "2026-06-28T00:00:00.000Z",
    tier: "block",
    matcher: "—", // em-dash
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

describe("project policy block gate - schema (tier + matcher)", () => {
  it("defaults tier to advise and matcher to null", () => {
    const p = projectPolicySchema.parse({ id: "x", statement: "a rule" });
    expect(p.tier).toBe("advise");
    expect(p.matcher).toBeNull();
  });

  it("rejects a block policy with no matcher (a hard gate needs a matcher)", () => {
    const r = projectPolicySchema.safeParse({ id: "x", statement: "a rule", tier: "block" });
    expect(r.success).toBe(false);
  });

  it("rejects a matcher that is not a valid regex", () => {
    const r = projectPolicySchema.safeParse({ id: "x", statement: "a rule", tier: "block", matcher: "(" });
    expect(r.success).toBe(false);
  });

  it("accepts a block policy with a valid matcher", () => {
    const r = projectPolicySchema.safeParse({ id: "x", statement: "a rule", tier: "block", matcher: "—" });
    expect(r.success).toBe(true);
  });
});

describe("project policy block gate - evaluateBlockPolicies", () => {
  it("flags a block policy whose matcher matches an added line", () => {
    const r = evaluateBlockPolicies([policy()], DIFF);
    expect(r.clean).toBe(false);
    expect(r.violations.map((v) => v.id)).toEqual(["no-em-dash"]);
    expect(r.violations[0]!.file).toBe("src/a.ts");
  });

  it("an ADVISE policy never caps the merge (even if it would match)", () => {
    expect(evaluateBlockPolicies([policy({ tier: "advise", matcher: null })], DIFF).clean).toBe(true);
  });

  it("an UNCONFIRMED block policy is inert (trust gate)", () => {
    expect(evaluateBlockPolicies([policy({ confirmedAt: null })], DIFF).clean).toBe(true);
  });

  it("does not match content/context lines, only added lines", () => {
    const onlyContext = " const note = `done — shipped`;\n const x = 1;";
    expect(evaluateBlockPolicies([policy()], onlyContext).clean).toBe(true);
  });

  it("skips secret-like files (a match inside .env does not count)", () => {
    const envOnly = ["+++ b/.env", "+SECRET=—value—"].join("\n");
    expect(evaluateBlockPolicies([policy()], envOnly).clean).toBe(true);
  });

  it("a non-compiling matcher is inert (fail-open), not a crash or a violation", () => {
    const r = evaluateBlockPolicies([policy({ id: "bad", matcher: "(" })], DIFF);
    expect(r.clean).toBe(true);
    expect(r.inert.map((i) => i.id)).toContain("bad");
  });

  it("clean when nothing matches", () => {
    const r = evaluateBlockPolicies([policy({ matcher: "ZZZ_nope" })], DIFF);
    expect(r.clean).toBe(true);
    expect(r.violations).toEqual([]);
  });
});
