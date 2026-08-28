import { z } from "zod";

/**
 * Why a run ended, as a typed code.
 *
 * The run's `error` field is free text, so everything downstream had to guess
 * from it - `errLower.includes("spend cap")` in the UI's outcome mapper being
 * the clearest example, for a cause that already emits a typed `spend.capped`
 * event. A string is not a failure value: callers must branch on a code.
 *
 * This exists so a supervisor can decide what to DO about a terminal state
 * without asking a model what it thinks happened. The classes below are the
 * ones with a deterministic signal already in the run's own evidence; anything
 * else stays `unknown`, and `unknown` must never be treated as safe to retry.
 */
export const terminalCauseSchema = z.enum([
  /** Finished cleanly. */
  "completed",
  /** A budget ceiling stopped it (`spend.capped`, budget governor). */
  "spend_cap",
  /** Provider retries or a usage limit gave up (`provider.retries_exhausted`,
   *  `provider.usage_limit` resolved "give-up"). This is EXHAUSTION - the run
   *  ran out of road without naming a defect, and it is the class where the
   *  system's own account of itself is least trustworthy. */
  "provider_exhausted",
  /** An approval was requested and nobody answered (`approval.expired`).
   *  Expected on an unattended run; it means "not certified", not "broken". */
  "approval_expired",
  /** A policy or scope gate refused the diff. A real, named refusal. */
  "policy_block",
  /** Validation could not RUN - missing toolchain, no environment. The one
   *  class that is genuinely a system fault a remediation could fix. */
  "validation_environment",
  /** Validation ran and failed. A real defect in the work. */
  "validation_failed",
  /** The reviewer asked for changes and the loop budget ran out. */
  "review_unresolved",
  /** The run threw. */
  "error",
  /** No deterministic signal. NEVER auto-retry on this. */
  "unknown",
]);
export type TerminalCause = z.infer<typeof terminalCauseSchema>;

/**
 * Is this cause a fault in the ENVIRONMENT rather than in the work?
 *
 * Deliberately narrow. Only `validation_environment` qualifies: the toolchain
 * was missing, so nothing about the code was actually tested. Everything else
 * either names a real defect, or is exhaustion - and retrying exhaustion is
 * how an autonomous loop burns a budget without converging.
 */
export function isEnvironmentFault(cause: TerminalCause): boolean {
  return cause === "validation_environment";
}

/**
 * May an autonomous supervisor retry this without a human?
 *
 * Only an environment fault. `unknown` is excluded on purpose - absent
 * evidence means stop, never "assume it was transient".
 */
export function isAutoRemediable(cause: TerminalCause): boolean {
  return isEnvironmentFault(cause);
}

/**
 * Classify a finished run from ITS OWN EVIDENCE - events and validation
 * results, never a model's account of what it thinks went wrong.
 *
 * This repo already draws the line in writing (run-engagement.ts): "the
 * orchestrator is itself a model, so a judgment is advisory and can be wrong,
 * while an enforced gate is deterministic and authoritative. The two must
 * never be conflated." A classifier that decided "this was just exhaustion,
 * retry it" by asking a model would be exactly that conflation, and exhaustion
 * is the case where a failing system's self-report is least reliable.
 *
 * Order matters: the most specific, most consequential signal wins. Absent any
 * signal the answer is `unknown`, which callers must treat as stop.
 */
export function deriveTerminalCause(input: {
  status: string;
  events: { type: string; data?: Record<string, unknown> }[];
  validation?: { summary: { failed: number; environment: number } } | null;
  /** The reviewer's last word. A run can block for no other reason than this. */
  reviewDecision?: string | null;
}): TerminalCause {
  if (input.status === "merge_ready") return "completed";

  const has = (type: string, pred?: (d: Record<string, unknown> | undefined) => boolean) =>
    input.events.some((e) => e.type === type && (pred ? pred(e.data) : true));

  // A budget ceiling is the loudest stop there is, and it emits a typed event -
  // the UI used to find this by substring-matching the error prose.
  if (has("spend.capped") || has("budget.exhausted")) return "spend_cap";

  // A refusal that NAMES something beats exhaustion: a policy block is a real
  // finding, and reporting it as "ran out of road" would hide the reason.
  if (has("supervisor.policy_block", (d) => d?.["inert"] !== true)) return "policy_block";
  if (has("scope.violation")) return "policy_block";

  // Validation that could not RUN is the one genuine environment fault.
  // Ordered before validation_failed: if the toolchain was missing, the
  // failures downstream of it are not evidence about the code.
  if ((input.validation?.summary.environment ?? 0) > 0) return "validation_environment";
  if ((input.validation?.summary.failed ?? 0) > 0) return "validation_failed";

  // Exhaustion. Deliberately LAST among the specific signals, so anything that
  // named a cause is preferred over "it gave up".
  if (has("provider.retries_exhausted")) return "provider_exhausted";
  if (has("provider.usage_limit", (d) => d?.["resolved"] === "give-up")) return "provider_exhausted";

  // An unanswered approval on an unattended run is expected, and it means "not
  // certified" rather than "defective" - so it must not read as a failure.
  if (has("approval.expired")) return "approval_expired";

  // The reviewer never certified it. Found by driving a real run: a task whose
  // reviewer kept asking for changes until the loop budget ran out derived
  // `unknown`, which is the worst possible answer - "no evidence" is the one
  // class that must never be acted on, and here there was plenty of evidence.
  // Covers BLOCKED too: both mean the reviewer declined and named findings.
  if (input.reviewDecision === "CHANGES_REQUESTED" || input.reviewDecision === "BLOCKED") {
    return "review_unresolved";
  }

  if (input.status === "failed") return "error";
  return "unknown";
}
