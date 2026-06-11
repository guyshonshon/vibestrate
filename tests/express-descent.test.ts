import { describe, it, expect } from "vitest";
import { evaluateReviewDescent } from "../src/core/review-descent.js";
import {
  computeMergeReady,
  isReviewSatisfied,
  type MergeReadinessInput,
} from "../src/core/merge-readiness.js";
import { deriveRunAssurance } from "../src/safety/run-assurance.js";
import { expressFlow } from "../src/flows/catalog/builtin-flows.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";

// ── The descent evaluator: strict-prose AND unprotected, else review runs ──

describe("evaluateReviewDescent", () => {
  it("skips only for strict-prose, unprotected diffs", () => {
    const d = evaluateReviewDescent(["docs/note.md", "README.txt", "spec.rst"]);
    expect(d.skip).toBe(true);
    expect(d.reason).toBe("all-prose-unprotected");
  });

  it("an .svg never skips review (B3-inert is NOT review-inert)", () => {
    const d = evaluateReviewDescent(["assets/icon.svg"]);
    expect(d.skip).toBe(false);
    expect(d.nonProse).toEqual(["assets/icon.svg"]);
  });

  it("one code file disqualifies the whole diff", () => {
    expect(evaluateReviewDescent(["a.md", "src/x.ts"]).skip).toBe(false);
  });

  it("a protected prose file disqualifies (A2 floor)", () => {
    const d = evaluateReviewDescent([".vibestrate/skills/notes.md"]);
    expect(d.skip).toBe(false);
    expect(d.reason).toBe("protected-files");
  });

  it("an empty diff never skips (nothing earned the skip)", () => {
    expect(evaluateReviewDescent([]).skip).toBe(false);
    expect(evaluateReviewDescent([]).reason).toBe("empty-diff");
  });

  it("extension-less / dotfiles never skip", () => {
    expect(evaluateReviewDescent(["Makefile"]).skip).toBe(false);
    expect(evaluateReviewDescent([".gitignore"]).skip).toBe(false);
  });

  it("user protectedPaths extend the floor", () => {
    const d = evaluateReviewDescent(["docs/runbooks/failover.md"], {
      protectedPaths: ["docs/runbooks/**"],
    });
    expect(d.skip).toBe(false);
  });
});

// ── The merge-readiness invariant (the load-bearing P4b test) ──────────────

const base: MergeReadinessInput = {
  readOnly: false,
  reviewDecision: "BLOCKED",
  reviewTurnRan: false,
  reviewSkipEvidence: null,
  validationPassed: true,
  verified: false,
  verificationDecision: "NEEDS_HUMAN",
};

describe("computeMergeReady - express skip semantics", () => {
  it("skip evidence + no review turn -> merge ready", () => {
    expect(
      computeMergeReady({
        ...base,
        reviewSkipEvidence: { stepId: "review", files: ["a.md"] },
      }),
    ).toBe(true);
  });

  it("no review turn AND no evidence -> never merge ready", () => {
    expect(computeMergeReady(base)).toBe(false);
  });

  it("a review that RAN always beats evidence (objection wins)", () => {
    expect(
      computeMergeReady({
        ...base,
        reviewTurnRan: true,
        reviewDecision: "CHANGES_REQUESTED",
        reviewSkipEvidence: { stepId: "review", files: ["a.md"] },
      }),
    ).toBe(false);
  });

  it("evidence never substitutes for validation", () => {
    expect(
      computeMergeReady({
        ...base,
        reviewSkipEvidence: { stepId: "review", files: ["a.md"] },
        validationPassed: false,
      }),
    ).toBe(false);
  });

  it("evidence never substitutes for a failed verification", () => {
    expect(
      computeMergeReady({
        ...base,
        reviewSkipEvidence: { stepId: "review", files: ["a.md"] },
        verified: true,
        verificationDecision: "FAILED",
      }),
    ).toBe(false);
  });

  it("read-only runs never use evidence", () => {
    expect(
      isReviewSatisfied({
        ...base,
        readOnly: true,
        reviewSkipEvidence: { stepId: "review", files: ["a.md"] },
      }),
    ).toBe(false);
  });

  it("APPROVED review behaves exactly as before", () => {
    expect(
      computeMergeReady({
        ...base,
        reviewTurnRan: true,
        reviewDecision: "APPROVED",
      }),
    ).toBe(true);
  });
});

// ── Assurance honesty: a skip run can never read as verified ───────────────

describe("assurance for a skip-evidence run", () => {
  it("reports skipped_inert_diff + caps at partially_verified", () => {
    const a = deriveRunAssurance({
      runId: "r1",
      runStatus: "merge_ready",
      finalDecision: null,
      reviewSkipped: true,
      verification: null,
      actionLog: [
        {
          request: { runId: "r1", kind: "command.run", subject: {}, proposedBy: "system" },
          decision: { effect: "allow", ruleIds: [] },
          evidence: { ok: true, summary: "validate" },
          at: "2026-06-11T00:00:00.000Z",
        } as never,
      ],
      generatedAt: "2026-06-11T00:00:00.000Z",
    });
    expect(a.review.status).toBe("skipped_inert_diff");
    expect(a.verdict).toBe("partially_verified");
    expect(a.verdict).not.toBe("verified");
    expect(a.caps).toContain("review_skipped_inert_diff");
  });

  it("without the skip flag a null decision stays 'missing'", () => {
    const a = deriveRunAssurance({
      runId: "r1",
      runStatus: "merge_ready",
      finalDecision: null,
      verification: null,
      actionLog: [],
      generatedAt: "2026-06-11T00:00:00.000Z",
    });
    expect(a.review.status).toBe("missing");
  });
});

// ── Schema guards ───────────────────────────────────────────────────────────

describe("skipWhen schema validation", () => {
  it("the express builtin parses and carries skipWhen on its review", () => {
    expect(expressFlow.id).toBe("express");
    expect(expressFlow.steps.find((s) => s.id === "review")?.skipWhen).toBe(
      "inert_diff",
    );
  });

  const okBase = {
    id: "t",
    version: 1,
    label: "T",
    description: "test flow",
    seats: { implementer: { label: "I" }, reviewer: { label: "R" } },
  };

  it("rejects skipWhen on a non-review-turn", () => {
    const r = flowDefinitionSchema.safeParse({
      ...okBase,
      steps: [
        {
          id: "a",
          label: "A",
          kind: "agent-turn",
          seat: "implementer",
          skipWhen: "inert_diff",
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects skipWhen inside the adaptive loop body", () => {
    const r = flowDefinitionSchema.safeParse({
      ...okBase,
      steps: [
        { id: "impl", label: "I", kind: "agent-turn", seat: "implementer" },
        {
          id: "review",
          label: "R",
          kind: "review-turn",
          seat: "reviewer",
          skipWhen: "inert_diff",
        },
        { id: "fix", label: "F", kind: "response-turn", seat: "implementer" },
      ],
      loop: { from: "review", to: "fix", decisionStep: "review", maxIterations: 2 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects skipWhen in a checklist flow (per-item commits narrow the diff)", () => {
    const r = flowDefinitionSchema.safeParse({
      ...okBase,
      steps: [
        { id: "impl", label: "I", kind: "agent-turn", seat: "implementer" },
        {
          id: "review",
          label: "R",
          kind: "review-turn",
          seat: "reviewer",
          skipWhen: "inert_diff",
        },
      ],
      checklistSegment: { from: "impl", to: "review" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects skipWhen in a graph flow", () => {
    const r = flowDefinitionSchema.safeParse({
      ...okBase,
      steps: [
        { id: "impl", label: "I", kind: "agent-turn", seat: "implementer" },
        {
          id: "review",
          label: "R",
          kind: "review-turn",
          seat: "reviewer",
          needs: ["impl"],
          skipWhen: "inert_diff",
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
