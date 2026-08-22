import { describe, it, expect } from "vitest";
import { evaluateScope } from "../src/supervisor/scope-gate.js";

// The allowlist a real architect emitted in this project's own benchmark, and
// the files its implementer actually produced.
const REAL_ALLOWLIST = [
  "package.json",
  "server.js",
  "src/*.js",
  "db/*.js",
  "scripts/*.js",
  "public/*.html",
  "public/*.css",
  "public/*.js",
  "README.md",
  ".gitignore",
];
const REAL_FILES = [
  ".gitignore",
  "README.md",
  "db/index.js",
  "db/schema.sql",
  "db/seed.js",
  "package-lock.json",
  "package.json",
  "public/app.js",
  "public/index.html",
  "public/style.css",
  "server.js",
  "test/api.test.js",
];

describe("evaluateScope - the leak it was built for", () => {
  it("catches the out-of-scope test suite three of three real runs produced", () => {
    const r = evaluateScope({ mayEdit: REAL_ALLOWLIST, mayNotEdit: [] }, REAL_FILES);
    expect(r.clean).toBe(false);
    expect(r.violations.map((v) => v.file)).toContain("test/api.test.js");
  });

  it("does not cap the merge over a generated lockfile the architect forgot", () => {
    const r = evaluateScope({ mayEdit: REAL_ALLOWLIST, mayNotEdit: [] }, REAL_FILES);
    expect(r.violations.map((v) => v.file)).not.toContain("package-lock.json");
  });

  it("flags db/schema.sql too - the allowlist said db/*.js, and .sql is not .js", () => {
    const r = evaluateScope({ mayEdit: REAL_ALLOWLIST, mayNotEdit: [] }, REAL_FILES);
    expect(r.violations.map((v) => v.file)).toContain("db/schema.sql");
  });
});

describe("evaluateScope - fail-open on silence", () => {
  it("is clean when no scope was declared, so a flow without an architect still runs", () => {
    const r = evaluateScope(null, ["anything.js", "at/all.ts"]);
    expect(r).toEqual({ clean: true, declared: false, violations: [], inert: [] });
  });

  it("is clean when both lists are empty", () => {
    expect(evaluateScope({ mayEdit: [], mayNotEdit: [] }, ["x.js"]).declared).toBe(false);
  });

  it("a denylist alone does not turn every other file into a violation", () => {
    const r = evaluateScope({ mayEdit: [], mayNotEdit: ["**/*.env"] }, ["src/a.js", "b.env"]);
    expect(r.violations.map((v) => v.file)).toEqual(["b.env"]);
  });
});

describe("evaluateScope - precedence and shape", () => {
  it("mayNotEdit beats mayEdit", () => {
    const r = evaluateScope(
      { mayEdit: ["src/**"], mayNotEdit: ["src/secrets/**"] },
      ["src/ok.js", "src/secrets/keys.js"],
    );
    expect(r.violations).toEqual([
      { file: "src/secrets/keys.js", reason: "explicitly-forbidden", glob: "src/secrets/**" },
    ]);
  });

  it("normalises ./ and backslashes so a path shape cannot dodge the gate", () => {
    const r = evaluateScope({ mayEdit: ["src/*.js"], mayNotEdit: [] }, ["./src/a.js"]);
    expect(r.clean).toBe(true);
  });

  it("passes a run that stays inside its allowlist", () => {
    const r = evaluateScope(
      { mayEdit: ["src/**", "README.md"], mayNotEdit: [] },
      ["src/a.js", "src/deep/b.js", "README.md"],
    );
    expect(r).toMatchObject({ clean: true, declared: true, violations: [] });
  });
});

// The pure evaluator being right is not enough - it has to reach the merge
// decision. This pins the wiring, so removing `scopeClean` from
// computeMergeReady fails here rather than silently un-gating every run.
import { computeMergeReady } from "../src/core/run/merge-readiness.js";

const READY = {
  readOnly: false,
  reviewDecision: "APPROVED" as const,
  hasReviewStep: true,
  reviewTurnRan: true,
  reviewSkipEvidence: null,
  validationPassed: true,
  verified: true,
  verificationDecision: "PASSED" as const,
  checklistItemsClean: true,
  policiesClean: true,
};

describe("scope gate reaches the merge decision", () => {
  it("an otherwise-perfect run is NOT merge-ready when it left its declared scope", () => {
    expect(computeMergeReady({ ...READY, scopeClean: false })).toBe(false);
  });

  it("is merge-ready when it stayed inside scope", () => {
    expect(computeMergeReady({ ...READY, scopeClean: true })).toBe(true);
  });

  it("undefined scope does not cap - a flow with no architect is unaffected", () => {
    expect(computeMergeReady({ ...READY })).toBe(true);
  });
});

import { renderScopeBlock } from "../src/supervisor/scope-gate.js";
import { composeReviewerStepNotes } from "../src/supervisor/review-lenses.js";

describe("renderScopeBlock - telling the writer before the gate bites", () => {
  it("is null when nothing was declared, so the turn is byte-identical", () => {
    expect(renderScopeBlock(null)).toBeNull();
    expect(renderScopeBlock({ mayEdit: [], mayNotEdit: [] })).toBeNull();
  });

  it("names the allowlist and the consequence", () => {
    const b = renderScopeBlock({ mayEdit: ["src/**", "README.md"], mayNotEdit: [] })!;
    expect(b).toContain("src/**, README.md");
    expect(b).toContain("caps merge-readiness");
  });

  it("reaches a code-writing turn and NOT a reviewer", () => {
    const block = renderScopeBlock({ mayEdit: ["src/**"], mayNotEdit: [] })!;
    const writer = composeReviewerStepNotes({
      baseNotes: "base", lensEmphasis: null, isReviewer: false,
      scopeBlock: block, isCodeWriting: true,
    });
    const reviewer = composeReviewerStepNotes({
      baseNotes: "base", lensEmphasis: null, isReviewer: true,
      scopeBlock: block, isCodeWriting: false,
    });
    expect(writer).toContain("You may create or edit only");
    expect(reviewer).not.toContain("You may create or edit only");
  });
});
