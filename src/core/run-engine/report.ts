import path from "node:path";
import type { ArtifactStore } from "../artifact-store.js";
import type { RunState } from "../state-machine.js";
import type { ValidationResults } from "../validation-runner.js";
import type { PolicyWarning } from "../policy-engine.js";
import type { MetricsStore } from "../metrics-store.js";
import type { ApprovalService } from "../approval-service.js";
import type { ChecklistItemOutcome } from "../item-summary.js";
import { renderFinalReport } from "../final-report.js";
import { ReviewSuggestionService } from "../../reviews/review-suggestion-service.js";
import type { SuggestionSource } from "../../reviews/review-suggestion-types.js";
import type { NotificationDraft } from "../../notifications/notification-router.js";
import {
  FlowArbitrationStore,
  type FlowArbitrationLedger,
} from "../../flows/runtime/flow-arbitration.js";
import type { RoleRunResult } from "./types.js";

export async function writeFlowFinalReport(input: {
  projectRoot: string;
  artifactStore: ArtifactStore;
  state: RunState;
  lastValidation: ValidationResults | null;
  policyWarnings: PolicyWarning[];
  reviewLoops: number;
  metricsStore: MetricsStore;
  approvalService: ApprovalService;
  planArtifact: RoleRunResult | null;
  executionArtifact: RoleRunResult | null;
  reviewArtifact: RoleRunResult | null;
  verificationArtifact: RoleRunResult | null;
  checklistOutcomes?: ChecklistItemOutcome[];
}): Promise<string> {
  const metrics = (await input.metricsStore.read()) ?? null;
  const approvals = await input.approvalService.readAll().catch(() => []);
  // Pick-up runs: a consolidated per-item outcomes table alongside the report.
  const outcomes = input.checklistOutcomes ?? [];
  if (outcomes.length > 0) {
    const done = outcomes.filter((o) => o.status === "done").length;
    const table = [
      "# Checklist outcomes",
      "",
      `${done}/${outcomes.length} items completed.`,
      "",
      "| # | Item | Status | Commit | Files |",
      "| --- | --- | --- | --- | --- |",
      ...outcomes.map(
        (o) =>
          `| ${o.index + 1} | ${o.text.replace(/\|/g, "\\|")} | ${o.status} | ${o.commitSha ? o.commitSha.slice(0, 8) : "-"} | ${o.filesTouched.length} |`,
      ),
      "",
    ].join("\n");
    await input.artifactStore
      .write(path.posix.join("flows", "checklist", "outcomes.md"), table)
      .catch(() => {});
  }
  return writeFinalReport({
    projectRoot: input.projectRoot,
    artifactStore: input.artifactStore,
    state: input.state,
    validation: input.lastValidation,
    policyWarnings: input.policyWarnings,
    reviewLoops: input.reviewLoops,
    metrics,
    approvals,
    artifacts: {
      plan: input.planArtifact?.outputArtifactPath,
      execution: input.executionArtifact?.outputArtifactPath,
      review: input.reviewArtifact?.outputArtifactPath,
      verification: input.verificationArtifact?.outputArtifactPath,
    },
  });
}

export async function writeFinalReport(input: {
  projectRoot: string;
  artifactStore: ArtifactStore;
  state: RunState;
  validation: ValidationResults | null;
  policyWarnings: PolicyWarning[];
  reviewLoops: number;
  metrics: import("../runtime-metrics.js").RuntimeMetrics | null;
  approvals: import("../approval-types.js").ApprovalRequest[];
  artifacts: {
    plan?: string;
    architecture?: string;
    execution?: string;
    review?: string;
    verification?: string;
  };
}): Promise<string> {
  let suggestions: import("../../reviews/review-suggestion-types.js").ReviewSuggestion[] = [];
  try {
    suggestions = await new ReviewSuggestionService(
      input.projectRoot,
      input.state.runId,
    ).list();
  } catch {
    suggestions = [];
  }
  let bundles: import("../../reviews/suggestion-bundle-types.js").SuggestionBundle[] = [];
  try {
    const { SuggestionBundleService } = await import(
      "../../reviews/suggestion-bundle-service.js"
    );
    bundles = await new SuggestionBundleService(
      input.projectRoot,
      input.state.runId,
    ).list();
  } catch {
    bundles = [];
  }
  let arbitration: FlowArbitrationLedger | null = null;
  try {
    arbitration = await new FlowArbitrationStore(
      input.projectRoot,
      input.state.runId,
    ).read();
  } catch {
    arbitration = null;
  }
  const report = renderFinalReport({
    state: input.state,
    artifactPaths: input.artifacts,
    validation: input.validation,
    policyWarnings: input.policyWarnings,
    reviewLoops: input.reviewLoops,
    metrics: input.metrics,
    approvals: input.approvals,
    suggestions,
    bundles,
    arbitration,
  });
  return input.artifactStore.write("12-final-report.md", report);
}

/**
 * Capture VIBESTRATE_SUGGESTION marker blocks from a stage artifact. Best-effort:
 * never throws into the orchestrator's hot path. Notifies the dashboard via
 * the notification service when a suggestion was extracted (one summary
 * notification per stage, not one per suggestion).
 */
export async function ingestSuggestionsFromArtifact(input: {
  projectRoot: string;
  runId: string;
  artifactRelPath: string;
  artifactBody: string;
  source: SuggestionSource;
  notify?: (draft: NotificationDraft) => void;
}): Promise<void> {
  try {
    const svc = new ReviewSuggestionService(input.projectRoot, input.runId);
    const created = await svc.ingestArtifact({
      artifactRelPath: input.artifactRelPath,
      artifactBody: input.artifactBody,
      source: input.source,
    });
    if (created.length === 0) return;
    input.notify?.({
      severity: "attention",
      category: "review",
      title: `${created.length} suggestion${created.length > 1 ? "s" : ""} ready for review`,
      message: `Captured from ${input.source} artifact ${input.artifactRelPath}.`,
      runId: input.runId,
      sourceEventType: "suggestion.created",
      actionRequired: true,
      actionLabel: "Open run",
      actionUrl: `#/runs/${input.runId}`,
    });
  } catch {
    // Suggestion ingestion is best-effort - never fail a run because the
    // marker parser hiccupped.
  }
}
