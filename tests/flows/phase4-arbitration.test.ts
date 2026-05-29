import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { exportFlowArbitrationDataset } from "../../src/flows/runtime/flow-arbitration-export.js";
import { flowArbitrationLedgerSchema } from "../../src/flows/runtime/flow-arbitration.js";
import { qualityArbitrationFlow } from "../../src/flows/catalog/builtin-flows.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { applySetup } from "../../src/setup/setup-service.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { ReviewSuggestionService } from "../../src/reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../../src/reviews/suggestion-bundle-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeArbitrationRepo(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "vibestrate-flows-phase4-"),
  );
  await execa("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
  await execa("git", ["config", "user.email", "x@x"], { cwd: projectRoot });
  await execa("git", ["config", "user.name", "x"], { cwd: projectRoot });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    '{"name":"flow-arbitration-demo"}',
  );
  await execa("git", ["add", "."], { cwd: projectRoot });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: projectRoot });
  await applySetup({ options: { projectRoot }, detectionRunner: noProvider });

  const fakeProvider = path.join(projectRoot, "fake-arbitration-provider.js");
  await fs.writeFile(
    fakeProvider,
    `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (chunk) => prompt += chunk);
const block = (value) => [
  "VIBESTRATE_FLOW_OUTPUT:",
  JSON.stringify(value),
  "VIBESTRATE_FLOW_OUTPUT_END",
].join("\\n");
process.stdin.on("end", () => {
  if (prompt.includes("Flow step: Plan Review (plan-review)")) {
    console.log("# Plan Review\\n\\nDECISION: APPROVED\\n\\n" + block({
      contract: "vibestrate.flow.findings.v1",
      stepId: "plan-review",
      findings: []
    }));
  } else if (prompt.includes("Flow step: Implementation Review (implementation-review)")) {
    console.log("# Review\\n\\nDECISION: APPROVED\\n\\n" + block({
      contract: "vibestrate.flow.findings.v1",
      stepId: "implementation-review",
      findings: [{
        id: "finding-tests",
        severity: "high",
        category: "tests",
        claim: "The implementation needs failure-path coverage.",
        evidence: [{ kind: "diff", ref: "artifacts/flows/implement/diff-snapshot.json" }],
        recommendation: "Add or verify a regression test."
      }]
    }));
  } else if (prompt.includes("Flow step: Second Review (second-review)")) {
    console.log("# Second Review\\n\\nDECISION: APPROVED\\n\\n" + block({
      contract: "vibestrate.flow.finding-resolutions.v1",
      stepId: "second-review",
      resolutions: [{
        findingId: "finding-tests",
        disposition: "resolved",
        rationale: "The builder attached validation evidence.",
        evidence: [{ kind: "validation", ref: "artifacts/flows/validation/validation-results.json" }]
      }]
    }));
  } else if (prompt.includes("Flow step: Challenge Response (challenge-response)")) {
    console.log("# Challenge Response\\n\\n" + block({
      contract: "vibestrate.flow.finding-responses.v1",
      stepId: "challenge-response",
      responses: [{
        findingId: "finding-tests",
        disposition: "fix",
        rationale: "Validation now covers the changed path.",
        evidence: [{ kind: "validation", ref: "artifacts/flows/validation/validation-results.json" }]
      }]
    }));
  } else if (prompt.includes("Flow step: Decision Summary (decision-summary)")) {
    console.log("# Decision Summary\\n\\nVERIFICATION: PASSED\\n\\n" + block({
      contract: "vibestrate.flow.decision-summary.v1",
      stepId: "decision-summary",
      recommendation: "merge-ready",
      summary: "The accepted finding is resolved and validation passed.",
      validation: {
        status: "passed",
        evidence: [{ kind: "validation", ref: "artifacts/flows/validation/validation-results.json" }]
      },
      agreementFindingIds: ["finding-tests"],
      disagreementFindingIds: [],
      residualRisks: [],
      requiredHumanActions: []
    }));
  } else if (prompt.includes("Vibestrate Agent: planner")) {
    console.log("# Plan\\n\\nUse structured arbitration records.");
  } else if (prompt.includes("Vibestrate Agent: executor")) {
    console.log("# Implementation\\n\\nNo code change required.");
  } else {
    console.log("# Unhandled Flow turn");
  }
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fakeProvider, 0o755);
  await setConfigValue(
    projectRoot,
    "providers.fake-arbitration",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [fakeProvider],
      input: "stdin",
    }),
  );
  await setConfigValue(
    projectRoot,
    "profiles.claude-balanced.provider",
    "fake-arbitration",
  );
  await setConfigValue(
    projectRoot,
    "commands.validate",
    JSON.stringify(['node -e "process.exit(0)"']),
  );
  return projectRoot;
}

describe("Flow Phase 4 arbitration records", () => {
  it("parses evidence records, creates accepted-finding review work, and exports data", async () => {
    const projectRoot = await makeArbitrationRepo();
    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveFlow({
      flow: qualityArbitrationFlow,
      source: { kind: "builtin", ref: qualityArbitrationFlow.id },
      config: loaded.config,
      task: "Exercise structured quality arbitration.",
    });
    const result = await new Orchestrator({
      projectRoot,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      onProgress: () => {},
    }).run();

    expect(result.state.status).toBe("merge_ready");
    const runDir = path.join(projectRoot, ".vibestrate", "runs", result.runId);
    const ledger = flowArbitrationLedgerSchema.parse(
      JSON.parse(await fs.readFile(path.join(runDir, "arbitration.json"), "utf8")),
    );
    expect(ledger.findings.map((record) => record.finding.id)).toEqual([
      "finding-tests",
    ]);
    expect(ledger.responses[0]?.response.disposition).toBe("fix");
    expect(ledger.resolutions[0]?.resolution.disposition).toBe("resolved");
    expect(ledger.decision?.output.recommendation).toBe("merge-ready");
    expect(ledger.parseIssues).toEqual([]);
    expect(ledger.decisionSummaryPath).toBe(
      "artifacts/flows/decision-summary.md",
    );

    const suggestions = await new ReviewSuggestionService(
      projectRoot,
      result.runId,
    ).list();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      source: "artifact",
      sourceArtifactPath:
        "artifacts/flows/implementation-review/output.md",
    });
    const bundles = await new SuggestionBundleService(
      projectRoot,
      result.runId,
    ).list();
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.suggestionIds).toEqual([suggestions[0]!.id]);
    expect(ledger.acceptedReviewPassId).toBe(bundles[0]!.id);

    await expect(
      fs.readFile(
        path.join(runDir, "artifacts", "flows", "decision-summary.md"),
        "utf8",
      ),
    ).resolves.toContain("finding-tests");
    await expect(
      fs.readFile(path.join(runDir, "artifacts", "12-final-report.md"), "utf8"),
    ).resolves.toContain("## Flow Arbitration");
    await expect(
      fs.readFile(
        path.join(
          runDir,
          "artifacts",
          "flows",
          "implementation-review",
          "prompt.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("VIBESTRATE_FLOW_OUTPUT:");
    await expect(
      fs.readFile(path.join(runDir, "events.ndjson"), "utf8"),
    ).resolves.toContain('"flow.decision.completed"');

    const exported = await exportFlowArbitrationDataset({
      projectRoot,
      runId: result.runId,
    });
    expect(exported.disagreementRecords).toEqual([]);
    expect(exported.providerTurns.map((turn) => turn.stepId)).toContain(
      "implementation-review",
    );
    expect(exported.acceptedSuggestions[0]?.id).toBe(suggestions[0]!.id);
    expect(exported.acceptedReviewPasses[0]?.id).toBe(bundles[0]!.id);
  });
});
