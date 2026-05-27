// Pure helpers for the run-navigation + terminal-state UX (Epic B / B2).
// No React / browser imports, so they unit-test under the node Vitest env.

import type { RunState, RunStatus } from "./types.js";

export type RunOutcomeAction = "rerun" | "review" | "events" | "diff";

export type RunOutcome = {
  kind: "blocked" | "failed" | "aborted";
  /** Short headline for the banner. */
  title: string;
  /** One- or two-sentence plain-language explanation of what happened. */
  reason: string;
  /** Suggested next actions, most useful first. */
  actions: RunOutcomeAction[];
};

const TERMINAL_NON_MERGE = new Set<RunStatus>(["blocked", "failed", "aborted"]);

/** True for statuses where the run has stopped and there's nothing live to
 *  show (no pulse, no ticking timer). merge_ready is terminal too but success. */
export function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_NON_MERGE.has(status) || status === "merge_ready";
}

/**
 * Explain a stopped, non-success run and what to do about it. Returns null for
 * runs that are still going or that ended at merge_ready — those don't need a
 * "what blocked it / what to do" banner.
 */
export function describeRunOutcome(run: RunState): RunOutcome | null {
  if (!TERMINAL_NON_MERGE.has(run.status)) return null;
  const err = (run.error ?? "").trim();
  const errLower = err.toLowerCase();

  if (run.status === "failed") {
    return {
      kind: "failed",
      title: "Run failed",
      reason: err || "The run hit an error before reaching a verdict.",
      actions: ["events", "rerun"],
    };
  }
  if (run.status === "aborted") {
    return {
      kind: "aborted",
      title: "Run aborted",
      reason: err || "The run was stopped before it finished.",
      actions: ["rerun", "events"],
    };
  }

  // blocked — try to name the specific cause.
  if (errLower.includes("spend cap")) {
    return {
      kind: "blocked",
      title: "Stopped by the spend cap",
      reason:
        err ||
        "The daily spend cap was reached, so the run stopped. Raise the cap or change its action in Metrics, then re-run.",
      actions: ["rerun", "events"],
    };
  }
  if (errLower.includes("approval")) {
    return {
      kind: "blocked",
      title: "Blocked — approval rejected",
      reason:
        "An approval gate was rejected, so the run stopped before merge. Re-run with the change addressed, or adjust the gate.",
      actions: ["events", "rerun"],
    };
  }
  if (run.finalDecision === "BLOCKED") {
    return {
      kind: "blocked",
      title: "Blocked by review",
      reason:
        "The reviewer blocked the change. Read the findings, then re-run with the fixes — or, if it was read-only, re-run with the executor given write access.",
      actions: ["review", "rerun"],
    };
  }
  if (run.verification === "FAILED" || run.verification === "NEEDS_HUMAN") {
    return {
      kind: "blocked",
      title: "Blocked at verification",
      reason:
        "Verification didn't pass cleanly. Check what the verifier flagged before re-running.",
      actions: ["review", "rerun"],
    };
  }
  return {
    kind: "blocked",
    title: "Run blocked",
    reason:
      err || "The run stopped before merge and needs a human decision.",
    actions: ["events", "rerun"],
  };
}

/** Filter runs for the quick switcher: matches task, runId, or status. */
export function filterRuns(runs: RunState[], query: string): RunState[] {
  const q = query.trim().toLowerCase();
  if (!q) return runs;
  return runs.filter(
    (r) =>
      r.task.toLowerCase().includes(q) ||
      r.runId.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q),
  );
}
