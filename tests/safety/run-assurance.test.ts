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
import { runDir, runStatePath, runActionsPath } from "../../src/utils/paths.js";
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
});
