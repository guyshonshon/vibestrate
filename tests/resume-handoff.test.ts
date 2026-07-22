import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildCarriedHandoffLines,
  readCarriedHandoffLines,
} from "../src/core/run/resume-handoff.js";
import {
  deriveLedgerState,
  LedgerStore,
  type LedgerEntry,
} from "../src/core/context/project-ledger.js";
import { runFlowArbitrationPath } from "../src/utils/paths.js";
import { flowArbitrationLedgerSchema } from "../src/flows/runtime/flow-arbitration.js";
import {
  flowDecisionSummaryOutputSchema,
  FLOW_DECISION_SUMMARY_CONTRACT,
  type FlowDecisionSummaryOutput,
} from "../src/flows/schemas/flow-output-contracts.js";

const NOW = "2026-06-16T00:00:00.000Z";

const decision = (over: Partial<FlowDecisionSummaryOutput> = {}): FlowDecisionSummaryOutput =>
  flowDecisionSummaryOutputSchema.parse({
    contract: FLOW_DECISION_SUMMARY_CONTRACT,
    stepId: "review",
    recommendation: "merge-ready",
    summary: "Chose worktree isolation over in-place edits.",
    validation: { status: "passed", evidence: [] },
    agreementFindingIds: [],
    disagreementFindingIds: [],
    residualRisks: [],
    requiredHumanActions: [],
    ...over,
  });

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  schemaVersion: 1,
  id: "x",
  kind: "decision",
  title: "t",
  detail: null,
  status: "shipped",
  sourceRunId: null,
  supersedes: null,
  relation: null,
  relatesTo: null,
  createdAt: NOW,
  tags: [],
  evidence: [],
  ...over,
});

describe("buildCarriedHandoffLines (pure)", () => {
  it("orders: decision -> risks -> human actions -> ledger decisions -> open follow-ups", () => {
    const lines = buildCarriedHandoffLines({
      decision: decision({
        residualRisks: ["Concurrent runs untested"],
        requiredHumanActions: ["Rotate the staging credential"],
      }),
      ledger: deriveLedgerState([
        entry({ id: "decision:r0", kind: "decision", title: "Decided: keep NDJSON ledger" }),
        entry({ id: "residual:r0:0", kind: "residual", status: "open", title: "Add prune command" }),
      ]),
    });
    expect(lines).toEqual([
      "Decision (merge-ready): Chose worktree isolation over in-place edits.",
      "Risk: Concurrent runs untested",
      "Human action: Rotate the staging credential",
      "Decided earlier: Decided: keep NDJSON ledger",
      "Open follow-up: Add prune command",
    ]);
  });

  it("caps each category so a noisy source can't bloat downstream prompts", () => {
    const many = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p} ${i}`);
    const lines = buildCarriedHandoffLines({
      decision: decision({
        residualRisks: many("risk", 20),
        requiredHumanActions: many("act", 20),
      }),
      ledger: null,
    });
    // 1 decision + 5 risks + 5 actions
    expect(lines).toHaveLength(11);
  });

  it("appends the first evidence ref as a locator hint", () => {
    const lines = buildCarriedHandoffLines({
      decision: null,
      ledger: deriveLedgerState([
        entry({
          id: "decision:r1",
          kind: "decision",
          title: "Decided: promote arbitration",
          evidence: [{ kind: "artifact", ref: "artifacts/flows/review/output.md" }],
        }),
      ]),
    });
    expect(lines).toEqual([
      "Decided earlier: Decided: promote arbitration [artifact:artifacts/flows/review/output.md]",
    ]);
  });

  it("no sources -> no lines", () => {
    expect(buildCarriedHandoffLines({ decision: null, ledger: null })).toEqual([]);
  });
});

describe("readCarriedHandoffLines (disk, best-effort per source)", () => {
  let dir: string;
  const sourceRunId = "noble-darwin";
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-carry-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads arbitration decision + ledger together", async () => {
    const p = runFlowArbitrationPath(dir, sourceRunId);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(
      p,
      JSON.stringify(
        flowArbitrationLedgerSchema.parse({
          schemaVersion: 1,
          runId: sourceRunId,
          flowId: "review-fix",
          flowVersion: 1,
          createdAt: NOW,
          updatedAt: NOW,
          decision: {
            output: decision({ residualRisks: ["Branch race untested"] }),
            sourceStepId: "review",
            sourceArtifactPath: "artifacts/flows/review/output.md",
          },
        }),
      ),
      "utf8",
    );
    await new LedgerStore(dir).append([
      entry({ id: "residual:r0:0", kind: "residual", status: "open", title: "Add prune command" }),
    ]);

    const lines = await readCarriedHandoffLines(dir, sourceRunId);
    expect(lines).toContain("Decision (merge-ready): Chose worktree isolation over in-place edits.");
    expect(lines).toContain("Risk: Branch race untested");
    expect(lines).toContain("Open follow-up: Add prune command");
  });

  it("a torn arbitration.json degrades to ledger-only, never throws", async () => {
    const p = runFlowArbitrationPath(dir, sourceRunId);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, "{ torn json", "utf8");
    await new LedgerStore(dir).append([
      entry({ id: "decision:r9", kind: "decision", title: "Decided: keep NDJSON" }),
    ]);
    const lines = await readCarriedHandoffLines(dir, sourceRunId);
    expect(lines).toEqual(["Decided earlier: Decided: keep NDJSON"]);
  });

  it("nothing on disk -> empty lines, no throw", async () => {
    expect(await readCarriedHandoffLines(dir, sourceRunId)).toEqual([]);
  });
});
