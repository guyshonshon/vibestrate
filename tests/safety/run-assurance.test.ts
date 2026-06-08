import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  deriveRunAssurance,
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

  it("backfills fields missing from a pre-0.7.11 assurance.json (coverage/caps)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-asr-"));
    try {
      const runId = "run-legacy";
      await ensureDir(runDir(root, runId));
      // A legacy artifact written before `coverage`/`caps` existed.
      await fs.writeFile(
        runAssurancePath(root, runId),
        JSON.stringify({ schemaVersion: 1, runId, status: "merge_ready", verdict: "verified" }),
      );

      const read = await readRunAssurance(root, runId);
      expect(read?.verdict).toBe("verified");
      // The function honors its RunAssurance contract instead of returning
      // undefined fields that crash every consumer.
      expect(read?.coverage).toEqual({ toleratedStepFailures: 0 });
      expect(read?.caps).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
