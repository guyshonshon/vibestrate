import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import { runChecklistItemArbitrationPath } from "../src/utils/paths.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import type { PerItemVerdict } from "../src/flows/runtime/per-item-verdicts.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const RUN = "checklist-verdicts-run";

/** Minimal valid arbitration ledger for a per-item band. */
function makeApprovedLedger(runId: string, itemIndex: number): unknown {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId,
    flowId: "pickup-review",
    flowVersion: 1,
    createdAt: now,
    updatedAt: now,
    findings: [],
    responses: [],
    resolutions: [],
    decision: {
      output: {
        contract: "vibestrate.flow.decision-summary.v1",
        stepId: `arbiter-item-${itemIndex}`,
        recommendation: "merge-ready",
        summary: `Item ${itemIndex} approved.`,
        validation: { status: "not-run", evidence: [] },
        agreementFindingIds: [],
        disagreementFindingIds: [],
        residualRisks: [],
        requiredHumanActions: [],
      },
      sourceStepId: `arbiter-item-${itemIndex}`,
      sourceArtifactPath: `flows/checklist/item-${itemIndex + 1}-decision.json`,
    },
    acceptedReviewPassId: null,
    decisionSummaryPath: null,
    parseIssues: [],
  };
}

function makeChangesRequestedLedger(runId: string, itemIndex: number): unknown {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId,
    flowId: "pickup-review",
    flowVersion: 1,
    createdAt: now,
    updatedAt: now,
    findings: [
      {
        finding: {
          id: "f1",
          severity: "high",
          category: "correctness",
          claim: "Something is wrong.",
          recommendation: "Fix it.",
          evidence: [{ kind: "artifact", ref: "flows/checklist/item-1-review.md" }],
        },
        sourceStepId: "review-correctness",
        sourceArtifactPath: "flows/checklist/item-1-review.md",
        suggestionId: null,
      },
    ],
    responses: [],
    resolutions: [],
    decision: {
      output: {
        contract: "vibestrate.flow.decision-summary.v1",
        stepId: `arbiter-item-${itemIndex}`,
        recommendation: "changes-requested",
        summary: `Item ${itemIndex} needs fixes.`,
        validation: { status: "not-run", evidence: [] },
        agreementFindingIds: ["f1"],
        disagreementFindingIds: [],
        residualRisks: [],
        requiredHumanActions: [],
      },
      sourceStepId: `arbiter-item-${itemIndex}`,
      sourceArtifactPath: `flows/checklist/item-${itemIndex + 1}-decision.json`,
    },
    acceptedReviewPassId: null,
    decisionSummaryPath: null,
    parseIssues: [],
  };
}

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "vibestrate-chk-vrd-srv-"),
  );
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  // Create a run with checklistProgress.total = 2.
  const store = new RunStateStore(dir, RUN);
  const s = createInitialState({
    runId: RUN,
    task: "checklist task",
    projectRoot: dir,
    worktreePath: null,
    branchName: "main",
    maxReviewLoops: 1,
  });
  await store.write({
    ...s,
    checklistProgress: { total: 2, completed: 2, currentItemId: null, currentIndex: 0 },
  });

  // Seed two per-item arbitration ledgers: item 0 = approved, item 1 = changes_requested.
  const item0Path = runChecklistItemArbitrationPath(dir, RUN, 0);
  const item1Path = runChecklistItemArbitrationPath(dir, RUN, 1);
  await fs.mkdir(path.dirname(item0Path), { recursive: true });
  await fs.writeFile(
    item0Path,
    JSON.stringify(makeApprovedLedger(RUN, 0)),
  );
  await fs.writeFile(
    item1Path,
    JSON.stringify(makeChangesRequestedLedger(RUN, 1)),
  );

  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("GET /api/runs/:id/checklist-verdicts", () => {
  it("returns per-item verdicts for a seeded run", async () => {
    const dir = await makeProject();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const res = await fetch(
      `${server.url}/api/runs/${RUN}/checklist-verdicts`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdicts: PerItemVerdict[] };
    expect(body.verdicts).toHaveLength(2);
    expect(body.verdicts[0]).toMatchObject({
      itemIndex: 0,
      verdict: "approved",
    });
    expect(body.verdicts[1]).toMatchObject({
      itemIndex: 1,
      verdict: "changes_requested",
    });
    expect(typeof body.verdicts[0]!.openFindingCount).toBe("number");
  });

  it("404s an unknown run", async () => {
    const dir = await makeProject();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const res = await fetch(
      `${server.url}/api/runs/does-not-exist/checklist-verdicts`,
    );
    expect(res.status).toBe(404);
  });
});
