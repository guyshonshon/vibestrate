import type { RunState } from "./state-machine.js";
import type { ValidationResults } from "./validation-runner.js";
import type { PolicyWarning } from "./policy-engine.js";
import type { RuntimeMetrics } from "./runtime-metrics.js";
import type { ApprovalRequest } from "./approval-types.js";
import type { ReviewSuggestion } from "../reviews/review-suggestion-types.js";
import type { SuggestionBundle } from "../reviews/suggestion-bundle-types.js";
import type { FlowArbitrationLedger } from "../flows/runtime/flow-arbitration.js";
import { summarizeFlowDisagreements } from "../flows/runtime/flow-arbitration.js";

export type FinalReportInput = {
  state: RunState;
  artifactPaths: {
    plan?: string;
    architecture?: string;
    execution?: string;
    review?: string;
    verification?: string;
  };
  validation: ValidationResults | null;
  policyWarnings: PolicyWarning[];
  reviewLoops: number;
  metrics: RuntimeMetrics | null;
  approvals: ApprovalRequest[];
  /** Suggestions captured for this run (optional). */
  suggestions?: ReviewSuggestion[];
  /** Review passes (suggestion bundles) for this run (optional). */
  bundles?: SuggestionBundle[];
  /** Structured Flow findings/response/decision record, when present. */
  arbitration?: FlowArbitrationLedger | null;
};

function renderValidation(v: ValidationResults | null): string {
  if (!v) return "_No validation results recorded._";
  if (v.commands.length === 0) return v.note ?? "No validation commands configured.";

  const header = `| Command | Exit | Status | Duration (ms) |\n| --- | --- | --- | --- |`;
  const rows = v.commands
    .map((c) => `| \`${c.command}\` | ${c.exitCode} | ${c.status} | ${c.durationMs} |`)
    .join("\n");
  return `${header}\n${rows}\n\n**Total:** ${v.summary.total} · **Passed:** ${v.summary.passed} · **Failed:** ${v.summary.failed}`;
}

function renderWarnings(w: PolicyWarning[]): string {
  if (w.length === 0) return "_No policy warnings._";
  return w.map((x) => `- **${x.code}** — ${x.message}`).join("\n");
}

function renderPath(p?: string): string {
  return p ? `\`${p}\`` : "_(not produced)_";
}

function renderNextSteps(state: RunState): string {
  switch (state.status) {
    case "merge_ready":
      return [
        "- Inspect the worktree.",
        "- Review the diff.",
        "- Run validation manually if desired.",
        "- Merge manually.",
      ].join("\n");
    case "blocked":
      return [
        "- Read the review and verification artifacts.",
        "- Resolve the blocker.",
        "- Start a new run or continue manually.",
      ].join("\n");
    case "failed":
      return [
        "- Inspect events.ndjson for the failure cause.",
        "- Fix the underlying issue and start a new run.",
      ].join("\n");
    case "aborted":
      return [
        "- Run was aborted manually.",
        "- Worktree was preserved; clean up manually if no longer needed.",
      ].join("\n");
    default:
      return "_Run did not reach a terminal state._";
  }
}

function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return "_not reported by provider_";
  return `$${usd.toFixed(4)} USD`;
}

function formatTokens(t: { input?: number; output?: number; cacheRead?: number; cacheCreation?: number } | null | undefined): string {
  if (!t) return "_not reported by provider_";
  const parts: string[] = [];
  if (t.input !== undefined) parts.push(`in: ${t.input}`);
  if (t.output !== undefined) parts.push(`out: ${t.output}`);
  if (t.cacheRead !== undefined) parts.push(`cache-read: ${t.cacheRead}`);
  if (t.cacheCreation !== undefined) parts.push(`cache-create: ${t.cacheCreation}`);
  return parts.length > 0 ? parts.join(" · ") : "_not reported by provider_";
}

function renderApprovalsSection(approvals: ApprovalRequest[]): string {
  if (approvals.length === 0) return "_No approval requests recorded._";
  const head = `| Approval ID | Stage | Agent | Source | Risk | Status | Requested Action | Reason | Decision Note | Created | Resolved |`;
  const sep = `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`;
  const rows = approvals.map((a) => {
    const escape = (s: string | null | undefined) =>
      s ? s.replace(/\|/g, "\\|") : "—";
    const sourceLabel =
      a.source === "policy"
        ? "policy"
        : a.alsoRequiredByPolicy
          ? "agent + policy"
          : "agent";
    return `| \`${a.id}\` | ${a.stageId} | ${a.roleId} | ${sourceLabel} | ${a.riskLevel} | ${a.status} | ${escape(a.requestedAction)} | ${escape(a.reason)} | ${escape(a.decisionNote)} | ${a.createdAt} | ${a.resolvedAt ?? "—"} |`;
  });
  return [head, sep, ...rows].join("\n");
}

function renderMetricsSection(metrics: RuntimeMetrics | null): string {
  if (!metrics || metrics.roles.length === 0) {
    return "_No runtime metrics recorded._";
  }
  const head = `| Stage | Agent | Provider | Duration | Exit | Skills | Diff (+/-) | Cost | Tokens | Decision |`;
  const sep = `| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- |`;
  const rows = metrics.roles.map((a) => {
    const skills = a.skillsAttached.length > 0 ? a.skillsAttached.join(", ") : "—";
    const diff =
      a.diffInsertionsAfter !== null && a.diffDeletionsAfter !== null
        ? `${a.diffInsertionsAfter}/${a.diffDeletionsAfter}`
        : "—";
    const cost = a.totalCostUsd !== null ? `$${a.totalCostUsd.toFixed(4)}` : "—";
    const tokens =
      a.tokenUsage && (a.tokenUsage.input || a.tokenUsage.output)
        ? `${a.tokenUsage.input ?? 0}→${a.tokenUsage.output ?? 0}`
        : "—";
    const decision = a.reviewDecision ?? a.verificationDecision ?? "—";
    return `| ${a.stageId} | ${a.roleId} | ${a.providerId} | ${a.durationMs}ms | ${a.exitCode} | ${skills} | ${diff} | ${cost} | ${tokens} | ${decision} |`;
  });
  const totals = [
    `**Total provider calls:** ${metrics.totalProviderCalls}`,
    `**Total agent duration:** ${metrics.totalDurationMs}ms`,
    `**Total cost:** ${formatCost(metrics.totalCostUsd)}`,
  ];
  return [head, sep, ...rows, "", ...totals].join("\n");
}

function renderBundlesSection(items: SuggestionBundle[] | undefined): string {
  if (!items || items.length === 0) {
    return "_No review passes were created for this run._";
  }
  const counts = items.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([k, v]) => `**${k}:** ${v}`)
    .join(" · ");
  const head =
    "| Status | Title | Profile | Suggestions | Validation | Reverted | Approval |\n| --- | --- | --- | --- | --- | --- | --- |";
  const rows = items
    .map((b) => {
      const validation = b.validationResultPath
        ? `\`${b.validationResultPath}\``
        : "—";
      const reverted = b.revertedAt ?? "—";
      const titleCell = isSmartStatus(b.status)
        ? `${b.title.replace(/\|/g, "\\|")} _(smart apply)_`
        : b.title.replace(/\|/g, "\\|");
      const profileCell = b.validationProfile ? `\`${b.validationProfile}\`` : "default";
      return `| ${b.status} | ${titleCell} | ${profileCell} | ${b.suggestionIds.length} | ${validation} | ${reverted} | ${b.approvalId ? `\`${b.approvalId}\`` : "—"} |`;
    })
    .join("\n");
  return [summary, "", head, rows].join("\n");
}

function isSmartStatus(s: string): boolean {
  return (
    s === "smart_applied" ||
    s === "smart_stopped" ||
    s === "smart_reverted_failing" ||
    s === "smart_failed" ||
    s === "smart_applying"
  );
}

function renderSuggestionsSection(items: ReviewSuggestion[] | undefined): string {
  if (!items || items.length === 0) {
    return "_No suggestions were captured for this run._";
  }
  const counts = items.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = ["open", "approved", "rejected", "applied", "failed", "resolved"]
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => `**${k}:** ${counts[k]}`)
    .join(" · ");
  const head = "| Status | Source | File | Title | Approval |\n| --- | --- | --- | --- | --- |";
  const rows = items
    .map((s) => {
      const target = s.file
        ? `${s.file}${s.lineStart ? `:${s.lineStart}${s.lineEnd ? `-${s.lineEnd}` : ""}` : ""}`
        : "—";
      return `| ${s.status} | ${s.source} | \`${target}\` | ${s.title.replace(/\|/g, "\\|")} | ${s.approvalId ? `\`${s.approvalId}\`` : "—"} |`;
    })
    .join("\n");
  return [summary, "", head, rows].join("\n");
}

function renderFlowArbitrationSection(
  arbitration: FlowArbitrationLedger | null | undefined,
): string {
  if (!arbitration) {
    return "_No structured Flow arbitration record was captured._";
  }
  const disagreements = summarizeFlowDisagreements(arbitration);
  return [
    `- Findings: ${arbitration.findings.length}`,
    `- Builder responses: ${arbitration.responses.length}`,
    `- Second-review resolutions: ${arbitration.resolutions.length}`,
    `- Disagreement records: ${disagreements.length}`,
    `- Parse gaps: ${arbitration.parseIssues.length}`,
    `- Decision record: ${arbitration.decision ? `\`${arbitration.decision.sourceArtifactPath}\`` : "_not parsed_"}`,
    `- Deterministic summary: ${arbitration.decisionSummaryPath ? `\`${arbitration.decisionSummaryPath}\`` : "_not produced_"}`,
    `- Accepted finding review pass: ${arbitration.acceptedReviewPassId ? `\`${arbitration.acceptedReviewPassId}\`` : "_none_"}`,
  ].join("\n");
}

export function renderFinalReport(input: FinalReportInput): string {
  const { state, artifactPaths, validation, policyWarnings, reviewLoops, metrics, approvals, suggestions, bundles, arbitration } = input;
  const summary = metrics?.approvalsSummary ?? null;
  const approvalSummaryLine = summary
    ? `**Total:** ${summary.total} · **Approved:** ${summary.approved} · **Rejected:** ${summary.rejected}${summary.expired ? ` · **Expired:** ${summary.expired}` : ""}${summary.pending ? ` · **Pending:** ${summary.pending}` : ""}${summary.totalWaitMs ? ` · **Total wait:** ${summary.totalWaitMs}ms` : ""}`
    : "";
  const flowArbitrationSection = state.flow
    ? `## Flow Arbitration

${renderFlowArbitrationSection(arbitration)}

`
    : "";

  return `# Amaco Final Report

## Run

- Run ID: ${state.runId}
- Task: ${state.task}
- Roadmap task: ${state.taskId ? `\`${state.taskId}\`` : "_(unlinked)_"}
- Status: ${state.status}
- Branch: ${state.branchName ?? "_(none)_"}
- Worktree: ${state.worktreePath ?? "_(none)_"}
- Started: ${state.startedAt}
- Updated: ${state.updatedAt}

## Final Decision

${state.finalDecision ?? "_(no review decision)_"}

## Verification

${state.verification ?? "_(no verification)_"}

## Summary

Run ${state.runId} for task: ${state.task}.

## Planner Output

Path: ${renderPath(artifactPaths.plan)}

## Architecture Output

Path: ${renderPath(artifactPaths.architecture)}

## Execution Output

Path: ${renderPath(artifactPaths.execution)}

## Validation Results

${renderValidation(validation)}

## Runtime Metrics

${renderMetricsSection(metrics)}

## Approval Decisions

${approvalSummaryLine}

${renderApprovalsSection(approvals)}

## Review Output

Path: ${renderPath(artifactPaths.review)}

## Review Loops

Completed: ${reviewLoops} (max ${state.maxReviewLoops})

## Policy Warnings

${renderWarnings(policyWarnings)}

## Review Suggestions

${renderSuggestionsSection(suggestions)}

## Review Passes

${renderBundlesSection(bundles)}

${flowArbitrationSection}## Next Steps

${renderNextSteps(state)}
`;
}
