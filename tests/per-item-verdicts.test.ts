import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import {
  collectPerItemVerdicts,
  deriveItemVerdict,
  openFindingCount,
} from "../src/flows/runtime/per-item-verdicts.js";
import { runChecklistItemArbitrationPath } from "../src/utils/paths.js";

describe("collectPerItemVerdicts", () => {
  it("deriveItemVerdict returns none for a null ledger", () => {
    expect(deriveItemVerdict(null)).toBe("none");
  });

  it("counts open findings (no resolution = open)", () => {
    const ledger: any = {
      findings: [{ finding: { id: "F1" } }, { finding: { id: "F2" } }],
      resolutions: [
        { resolution: { findingId: "F1", disposition: "resolved" } },
      ],
    };
    expect(openFindingCount(ledger)).toBe(1); // F2 still open
  });

  it("collects per-item verdicts across files, missing files -> none", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vbs-piv-"));
    const p0 = runChecklistItemArbitrationPath(root, "run1", 0);
    await mkdir(path.dirname(p0), { recursive: true });
    // Real schema: decision.output uses `recommendation` (not `verdict`).
    // "merge-ready" maps to "approved"; no `verdict` field exists.
    await writeFile(
      p0,
      JSON.stringify({
        schemaVersion: 1,
        runId: "run1",
        flowId: "pickup-review",
        flowVersion: 1,
        createdAt: "t",
        updatedAt: "t",
        findings: [],
        responses: [],
        resolutions: [],
        decision: {
          output: {
            contract: "vibestrate.flow.decision-summary.v1",
            stepId: "arbiter",
            recommendation: "merge-ready",
            summary: "all good",
            validation: { status: "passed" },
            agreementFindingIds: [],
            disagreementFindingIds: [],
            residualRisks: [],
            requiredHumanActions: [],
          },
          sourceStepId: "arbiter",
          sourceArtifactPath: "x",
        },
        acceptedReviewPassId: null,
        decisionSummaryPath: null,
        parseIssues: [],
      }),
    );
    const out = await collectPerItemVerdicts({
      projectRoot: root,
      runId: "run1",
      itemCount: 2,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      itemIndex: 0,
      verdict: "approved",
      openFindingCount: 0,
    });
    expect(out[1]).toMatchObject({ itemIndex: 1, verdict: "none" });
  });
});
