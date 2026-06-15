import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  deriveRunAssurance,
  deriveRunBlockers,
  deriveRunIsolation,
  buildAndWriteRunAssurance,
  readRunAssurance,
} from "../../src/safety/run-assurance.js";
import type { ActionRecord } from "../../src/safety/action-broker.js";
import { ensureDir } from "../../src/utils/fs.js";
import {
  runDir,
  runStatePath,
  runActionsPath,
  runAssurancePath,
  runEventsPath,
} from "../../src/utils/paths.js";
import { runStateSchema } from "../../src/core/state-machine.js";
import { writeJson } from "../../src/utils/json.js";

const rec = (over: Partial<ActionRecord>): ActionRecord => ({
  timestamp: "2026-05-30T00:00:00.000Z",
  request: { runId: "r", kind: "command.run", subject: {}, proposedBy: "system" },
  decision: { effect: "allow", ruleIds: [] },
  evidence: { ok: true },
  ...over,
});

const base = {
  runId: "r",
  generatedAt: "2026-05-30T00:00:00.000Z",
};

describe("deriveRunAssurance verdicts", () => {
  it("verified: merge_ready + approved + verification passed + validation passed", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ evidence: { ok: true } })],
    });
    expect(a.verdict).toBe("verified");
    expect(a.validation.status).toBe("passed");
  });

  it("unsafe: a failed rewind restore poisons an otherwise-verified run (ISSUE-001 P1)", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ evidence: { ok: true } })], // would be "verified"
      restoreFailed: true,
    });
    expect(a.verdict).toBe("unsafe");
    expect(a.caps).toContain("restore_failed");
    expect(a.summary).toMatch(/restore/i);
  });

  it("partially_verified: approved but verification not run", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: null,
      actionLog: [rec({ evidence: { ok: true } })],
    });
    expect(a.verdict).toBe("partially_verified");
    expect(a.caps).toContain("verification_not_run");
  });

  it("unverified: merge_ready with no evidence at all", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: null,
      verification: null,
      actionLog: [],
    });
    expect(a.verdict).toBe("unverified");
  });

  it("blocked: a non-terminal-success run status", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "blocked",
      finalDecision: "CHANGES_REQUESTED",
      verification: null,
      actionLog: [],
    });
    expect(a.verdict).toBe("blocked");
  });

  it("unsafe: a policy deny poisons the verdict", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [
        rec({
          request: {
            runId: "r",
            kind: "file.patch",
            subject: {},
            proposedBy: "system",
          },
          decision: { effect: "deny", ruleIds: ["no-env"], reason: "blocked" },
          evidence: null,
        }),
      ],
    });
    expect(a.verdict).toBe("unsafe");
    expect(a.policy.status).toBe("violated");
    expect(a.policy.rulesEvaluated).toContain("no-env");
  });

  it("unsafe: a failed rollback poisons the verdict", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [
        rec({
          request: {
            runId: "r",
            kind: "file.patch",
            subject: {},
            proposedBy: "system",
          },
          evidence: { ok: false, summary: "bundle apply failed; rollback failed" },
        }),
      ],
    });
    expect(a.verdict).toBe("unsafe");
  });

  it("excludes a DENIED command.run from the validation tally", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [
        rec({ evidence: { ok: true } }), // one real passing command
        rec({
          decision: { effect: "deny", ruleIds: ["no-net"], reason: "blocked" },
          evidence: null, // denied → not a validation result
        }),
      ],
    });
    // Only the executed command counts; the deny is a policy violation, not a
    // validation failure that silently inflates total.
    expect(a.validation).toMatchObject({ total: 1, passed: 1, failed: 0 });
    expect(a.validation.status).toBe("passed");
    // ...but the deny still poisons the overall verdict.
    expect(a.verdict).toBe("unsafe");
  });

  it("counts validation pass/fail from command.run evidence", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [
        rec({ evidence: { ok: true } }),
        rec({ evidence: { ok: false } }),
      ],
    });
    expect(a.validation).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(a.validation.status).toBe("failed");
    expect(a.verdict).toBe("partially_verified");
  });

  it("verified run with a tolerated step failure caps at partially_verified", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ evidence: { ok: true } })],
      toleratedStepFailures: 1,
    });
    // Would be "verified" without the tolerated failure (see the first test).
    expect(a.verdict).toBe("partially_verified");
    expect(a.caps).toContain("steps_failed_tolerated");
    expect(a.coverage.toleratedStepFailures).toBe(1);
    expect(a.summary).toContain("best-effort");
  });

  it("reports zero tolerated failures by default (still verified)", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ evidence: { ok: true } })],
    });
    expect(a.verdict).toBe("verified");
    expect(a.coverage.toleratedStepFailures).toBe(0);
    expect(a.caps).not.toContain("steps_failed_tolerated");
  });
});

describe("T2: applicability - nothing-to-verify is not a gap", () => {
  it("all lanes not-applicable reads 'verified', not partially_verified", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: null,
      verification: null,
      actionLog: [],
      validationApplicable: false,
      verificationApplicable: false,
      reviewApplicable: false,
    });
    expect(a.validation.status).toBe("not_applicable");
    expect(a.review.status).toBe("not_applicable");
    expect(a.verification.status).toBe("not_applicable");
    expect(a.verdict).toBe("verified");
    expect(a.caps).toHaveLength(0);
    expect(a.notes).toEqual(
      expect.arrayContaining([
        "validation_not_required",
        "review_not_required",
        "verification_not_required",
      ]),
    );
    expect(a.summary).toMatch(/no checks were required/i);
  });

  it("scoped-inert validation notes the inert reason, still verified", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: null,
      actionLog: [],
      validationApplicable: false,
      validationScopedInert: true,
      verificationApplicable: false,
    });
    expect(a.validation.status).toBe("not_applicable");
    expect(a.verdict).toBe("verified");
    expect(a.notes).toContain("validation_skipped_inert");
    // review approved is a real pass; summary leads with it, not "nothing".
    expect(a.summary).toMatch(/review.*passed/i);
  });

  it("a real validation gap (applicable but 0/0) stays a cap + partial", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [], // applicable, but nothing ran -> a genuine gap
      validationApplicable: true,
    });
    expect(a.validation.status).toBe("missing");
    expect(a.caps).toContain("validation_missing");
    expect(a.verdict).toBe("partially_verified");
  });

  it("mix of passed + not-applicable lanes is verified, not partial", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ evidence: { ok: true } })],
      validationApplicable: false, // no validate commands, but cmds ran? no:
    });
    // cmds has one passing command, so validation reads "passed" regardless of
    // the applicability flag (the flag only governs the 0/0 case).
    expect(a.validation.status).toBe("passed");
    expect(a.verdict).toBe("verified");
  });
});

describe("blockers + caps on blocked runs", () => {
  const blocker = {
    stepId: "implement",
    kind: "provider" as const,
    class: "usage-limit",
    detail: "This model is being rate limited, Would you like to switch over?",
  };

  it("a blocked run leads with the root cause, not downstream absence", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "blocked",
      finalDecision: null,
      verification: null,
      actionLog: [],
      toleratedStepFailures: 1,
      blockers: [blocker],
    });
    expect(a.verdict).toBe("blocked");
    expect(a.blockers).toEqual([blocker]);
    expect(a.summary).toContain('Cause at "implement"');
    expect(a.summary).toContain("rate limited");
    // The missing-trio is trivially implied by "blocked" - pure noise.
    expect(a.caps).not.toContain("validation_missing");
    expect(a.caps).not.toContain("review_missing");
    expect(a.caps).not.toContain("verification_not_run");
    // Informative caps survive.
    expect(a.caps).toContain("steps_failed_tolerated");
  });

  it("an unsafe run keeps every cap (a deny can land mid-run)", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: null,
      actionLog: [
        rec({
          request: { runId: "r", kind: "file.patch", subject: {}, proposedBy: "system" },
          decision: { effect: "deny", ruleIds: ["no-env"], reason: "blocked" },
          evidence: null,
        }),
      ],
    });
    expect(a.verdict).toBe("unsafe");
    expect(a.caps).toContain("validation_missing");
    expect(a.caps).toContain("verification_not_run");
  });

  it("a merge_ready run never carries blockers", () => {
    const a = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ evidence: { ok: true } })],
      blockers: [blocker],
    });
    expect(a.verdict).toBe("verified");
    expect(a.blockers).toEqual([]);
  });
});

describe("deriveRunBlockers", () => {
  it("provider give-up events win over the generic step error for the same step", () => {
    const blockers = deriveRunBlockers({
      steps: [
        { id: "plan", status: "passed", error: null },
        { id: "implement", status: "failed", error: "provider exited 1 (usage-limit: rate limited)" },
      ],
      events: [
        { type: "flow.step.started", data: { stepId: "implement" } },
        {
          type: "provider.usage_limit",
          data: { stepId: "implement", resolved: "give-up", detail: "This model is being rate limited" },
        },
      ],
    });
    expect(blockers).toEqual([
      {
        stepId: "implement",
        kind: "provider",
        class: "usage-limit",
        detail: "This model is being rate limited",
      },
    ]);
  });

  it("maps provider.retries_exhausted with its class and detail", () => {
    const blockers = deriveRunBlockers({
      steps: [],
      events: [
        {
          type: "provider.retries_exhausted",
          data: { stepId: "review", class: "rate-limit", retries: 5, detail: "429 too many requests" },
        },
      ],
    });
    expect(blockers).toEqual([
      { stepId: "review", kind: "provider", class: "rate-limit", detail: "429 too many requests" },
    ]);
  });

  it("falls back to failed/blocked step errors when no provider signal exists", () => {
    const blockers = deriveRunBlockers({
      steps: [
        { id: "implement", status: "failed", error: "provider exited 1" },
        { id: "gate", status: "blocked", error: null },
      ],
      events: [],
    });
    expect(blockers).toEqual([
      { stepId: "implement", kind: "step", class: null, detail: "provider exited 1" },
      { stepId: "gate", kind: "step", class: null, detail: "step blocked" },
    ]);
  });

  it("a waiting usage-limit event (not give-up) is not a blocker", () => {
    const blockers = deriveRunBlockers({
      steps: [],
      events: [
        { type: "provider.usage_limit", data: { stepId: "implement", action: "wait", waitMs: 60000 } },
      ],
    });
    expect(blockers).toEqual([]);
  });

  it("caps at 5 blockers", () => {
    const steps = Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      status: "failed",
      error: "boom",
    }));
    expect(deriveRunBlockers({ steps, events: [] })).toHaveLength(5);
  });
});

describe("deriveRunIsolation (posture from per-turn evidence, not config)", () => {
  const ev = (type: string) => ({ type });

  it("no confinement events -> none (the baseline default)", () => {
    expect(deriveRunIsolation([])).toEqual({
      posture: "none",
      osSandboxedTurns: 0,
      hardenedTurns: 0,
      unconfinedRequestedTurns: 0,
    });
  });

  it("OS-sandboxed turns -> sandboxed, counted", () => {
    const iso = deriveRunIsolation([ev("provider.sandboxed"), ev("provider.sandboxed")]);
    expect(iso.posture).toBe("sandboxed");
    expect(iso.osSandboxedTurns).toBe(2);
  });

  it("only claude plan-mode hardening -> hardened", () => {
    const iso = deriveRunIsolation([ev("provider.hardened")]);
    expect(iso.posture).toBe("hardened");
    expect(iso.hardenedTurns).toBe(1);
  });

  it("HONESTY: a requested-but-unconfined turn is partial, never sandboxed", () => {
    // Even with a real OS-sandboxed turn, if another turn was requested but ran
    // unconfined the headline must NOT claim full confinement.
    const iso = deriveRunIsolation([
      ev("provider.sandboxed"),
      ev("provider.sandbox_unavailable"),
    ]);
    expect(iso.posture).toBe("partial");
    expect(iso.osSandboxedTurns).toBe(1);
    expect(iso.unconfinedRequestedTurns).toBe(1);
  });

  it("OS sandbox + hardening together (no unconfined) -> sandboxed headline, both counted", () => {
    const iso = deriveRunIsolation([ev("provider.sandboxed"), ev("provider.hardened")]);
    expect(iso.posture).toBe("sandboxed");
    expect(iso.osSandboxedTurns).toBe(1);
    expect(iso.hardenedTurns).toBe(1);
  });
});

describe("isolation never affects the verdict (informational only)", () => {
  it("defaults to none when not provided, and a 'partial'/'sandboxed' posture adds no cap", () => {
    const plain = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ request: { runId: "r", kind: "command.run", subject: {}, proposedBy: "system" }, evidence: { ok: true } })],
    });
    expect(plain.isolation.posture).toBe("none");

    const confined = deriveRunAssurance({
      ...base,
      runStatus: "merge_ready",
      finalDecision: "APPROVED",
      verification: "PASSED",
      actionLog: [rec({ request: { runId: "r", kind: "command.run", subject: {}, proposedBy: "system" }, evidence: { ok: true } })],
      isolation: { posture: "partial", osSandboxedTurns: 1, hardenedTurns: 0, unconfinedRequestedTurns: 1 },
    });
    // Same verdict + same caps: isolation is informational, never a gap.
    expect(confined.isolation.posture).toBe("partial");
    expect(confined.verdict).toBe(plain.verdict);
    expect(confined.caps).toEqual(plain.caps);
  });
});

describe("buildAndWriteRunAssurance", () => {
  it("reads state + action log from disk and writes assurance.json", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-asr-"));
    try {
      const runId = "run-1";
      await ensureDir(runDir(root, runId));
      const ts = "2026-05-30T00:00:00.000Z";
      await writeJson(
        runStatePath(root, runId),
        runStateSchema.parse({
          runId,
          task: "t",
          status: "merge_ready",
          projectRoot: root,
          worktreePath: null,
          branchName: null,
          reviewLoopCount: 0,
          maxReviewLoops: 2,
          startedAt: ts,
          updatedAt: ts,
          finalDecision: "APPROVED",
          verification: "PASSED",
          error: null,
        }),
      );
      await fs.writeFile(
        runActionsPath(root, runId),
        JSON.stringify(rec({ evidence: { ok: true } })) + "\n",
      );

      const built = await buildAndWriteRunAssurance(root, runId);
      expect(built.verdict).toBe("verified");

      const read = await readRunAssurance(root, runId);
      expect(read?.verdict).toBe("verified");
      expect(read?.runId).toBe(runId);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("derives isolation posture from the run's provider events on disk", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-asr-"));
    try {
      const runId = "run-iso";
      await ensureDir(runDir(root, runId));
      const ts = "2026-05-30T00:00:00.000Z";
      await writeJson(
        runStatePath(root, runId),
        runStateSchema.parse({
          runId,
          task: "t",
          status: "merge_ready",
          projectRoot: root,
          worktreePath: null,
          branchName: null,
          reviewLoopCount: 0,
          maxReviewLoops: 2,
          startedAt: ts,
          updatedAt: ts,
          finalDecision: "APPROVED",
          verification: "PASSED",
          error: null,
        }),
      );
      await fs.writeFile(
        runActionsPath(root, runId),
        JSON.stringify(rec({ evidence: { ok: true } })) + "\n",
      );
      // codex executor sandboxed + claude reviewer hardened, nothing unconfined.
      await fs.writeFile(
        runEventsPath(root, runId),
        [
          JSON.stringify({ type: "provider.sandboxed", data: { provider: "codex", mode: "workspace-write" } }),
          JSON.stringify({ type: "provider.hardened", data: { provider: "claude", mode: "plan" } }),
        ].join("\n") + "\n",
      );

      const built = await buildAndWriteRunAssurance(root, runId);
      expect(built.isolation).toEqual({
        posture: "sandboxed",
        osSandboxedTurns: 1,
        hardenedTurns: 1,
        unconfinedRequestedTurns: 0,
      });
      // Posture is informational - it didn't drag a clean run off "verified".
      expect(built.verdict).toBe("verified");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("counts a failed flow step on a merge_ready run as a tolerated failure", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-asr-"));
    try {
      const runId = "run-tol";
      await ensureDir(runDir(root, runId));
      const ts = "2026-05-30T00:00:00.000Z";
      await writeJson(
        runStatePath(root, runId),
        runStateSchema.parse({
          runId,
          task: "t",
          status: "merge_ready",
          projectRoot: root,
          worktreePath: null,
          branchName: null,
          reviewLoopCount: 0,
          maxReviewLoops: 2,
          startedAt: ts,
          updatedAt: ts,
          finalDecision: "APPROVED",
          verification: "PASSED",
          error: null,
          flow: {
            flowId: "panel-review",
            flowVersion: 1,
            label: "Late review panel",
            snapshotPath: "snapshot.json",
            steps: [
              { id: "review-correctness", label: "Review: correctness", kind: "review-turn", status: "passed" },
              { id: "review-tests", label: "Review: tests", kind: "review-turn", status: "failed" },
              { id: "arbiter", label: "Arbiter verdict", kind: "review-turn", status: "passed" },
            ],
          },
        }),
      );
      await fs.writeFile(
        runActionsPath(root, runId),
        JSON.stringify(rec({ evidence: { ok: true } })) + "\n",
      );

      const built = await buildAndWriteRunAssurance(root, runId);
      expect(built.coverage.toleratedStepFailures).toBe(1);
      expect(built.verdict).toBe("partially_verified");
      expect(built.caps).toContain("steps_failed_tolerated");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("downgrades to unsafe when a run.rewound.restored event reports ok:false", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-asr-"));
    try {
      const runId = "run-restore-fail";
      await ensureDir(runDir(root, runId));
      const ts = "2026-05-30T00:00:00.000Z";
      await writeJson(
        runStatePath(root, runId),
        runStateSchema.parse({
          runId,
          task: "t",
          status: "merge_ready",
          projectRoot: root,
          worktreePath: null,
          branchName: null,
          reviewLoopCount: 0,
          maxReviewLoops: 2,
          startedAt: ts,
          updatedAt: ts,
          finalDecision: "APPROVED",
          verification: "PASSED",
          error: null,
        }),
      );
      await fs.writeFile(
        runActionsPath(root, runId),
        JSON.stringify(rec({ evidence: { ok: true } })) + "\n",
      );
      await fs.writeFile(
        runEventsPath(root, runId),
        JSON.stringify({
          type: "run.rewound.restored",
          data: { sourceRunId: "src", seq: 3, stage: "review", ok: false, safe: true },
        }) + "\n",
      );

      const built = await buildAndWriteRunAssurance(root, runId);
      expect(built.verdict).toBe("unsafe");
      expect(built.caps).toContain("restore_failed");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("a successful restore (ok:true) does NOT downgrade the verdict", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-asr-"));
    try {
      const runId = "run-restore-ok";
      await ensureDir(runDir(root, runId));
      const ts = "2026-05-30T00:00:00.000Z";
      await writeJson(
        runStatePath(root, runId),
        runStateSchema.parse({
          runId,
          task: "t",
          status: "merge_ready",
          projectRoot: root,
          worktreePath: null,
          branchName: null,
          reviewLoopCount: 0,
          maxReviewLoops: 2,
          startedAt: ts,
          updatedAt: ts,
          finalDecision: "APPROVED",
          verification: "PASSED",
          error: null,
        }),
      );
      await fs.writeFile(
        runActionsPath(root, runId),
        JSON.stringify(rec({ evidence: { ok: true } })) + "\n",
      );
      await fs.writeFile(
        runEventsPath(root, runId),
        JSON.stringify({
          type: "run.rewound.restored",
          data: { sourceRunId: "src", seq: 3, stage: "review", ok: true, safe: true },
        }) + "\n",
      );

      const built = await buildAndWriteRunAssurance(root, runId);
      expect(built.verdict).toBe("verified");
      expect(built.caps).not.toContain("restore_failed");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("treats a stale/partial assurance.json as ABSENT (returns null -> caller re-derives)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-asr-"));
    try {
      const runId = "run-legacy";
      await ensureDir(runDir(root, runId));
      // An old artifact written before the current fields existed. No back-compat
      // backfill: assurance.json is a regenerable cache, so a non-current shape
      // is treated as missing and `null` is returned (the route/CLI then
      // re-derive from evidence). It is NOT cast into consumers un-guarded.
      await fs.writeFile(
        runAssurancePath(root, runId),
        JSON.stringify({ schemaVersion: 1, runId, status: "merge_ready", verdict: "verified" }),
      );
      expect(await readRunAssurance(root, runId)).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
