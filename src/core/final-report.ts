import type { RunState } from "./state-machine.js";
import type { ValidationResults } from "./validation-runner.js";
import type { PolicyWarning } from "./policy-engine.js";

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

export function renderFinalReport(input: FinalReportInput): string {
  const { state, artifactPaths, validation, policyWarnings, reviewLoops } = input;

  return `# Amaco Final Report

## Run

- Run ID: ${state.runId}
- Task: ${state.task}
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

## Review Output

Path: ${renderPath(artifactPaths.review)}

## Review Loops

Completed: ${reviewLoops} (max ${state.maxReviewLoops})

## Policy Warnings

${renderWarnings(policyWarnings)}

## Next Steps

${renderNextSteps(state)}
`;
}
