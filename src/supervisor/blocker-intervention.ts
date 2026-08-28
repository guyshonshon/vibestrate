// ── Supervisor blocker intervention ─────────────────────────────────────────
//
// What the Supervisor offers to DO about a run that ended without completing.
//
// The proposal is a lookup, not a judgment. `terminalCause` is already derived
// from the run's own evidence (core/run/terminal-cause.ts), and this maps a
// cause to a remedy that a human can read and either accept or ignore. No
// model is asked what it thinks went wrong, because the system doing the
// asking is the system that just failed - and "it was only exhaustion, try
// again" is exactly the self-report that cannot be trusted.
//
// TWO MODES, and they are the existing autonomy setting, not a new one:
//
//   advise (default) - raise a notification saying what it would do, and stop.
//   act              - carry out the remedy, but ONLY where the fault is
//                      deterministically an environment fault.
//
// `act` is deliberately narrower than "do whatever you proposed". A supervisor
// that retries exhaustion is a supervisor that burns a budget in a loop without
// converging, so `isAutoRemediable` gates the acting path even when the user
// has turned autonomy all the way up.
import type { TerminalCause } from "../core/run/terminal-cause.js";
import { isAutoRemediable } from "../core/run/terminal-cause.js";
import type { NotificationDraft } from "../notifications/notification-router.js";
import { readPauseState } from "./autonomy-gate.js";

export type InterventionKind =
  /** Re-run the same work: the fault was in the environment, not the code. */
  | "retry_after_environment_fix"
  /** A person has to decide something. The honest stop. */
  | "needs_human_decision"
  /** A ceiling was hit on purpose; raising it is a spending decision. */
  | "needs_budget_decision"
  /** A real defect was found and named. Fixing it is more work, not a retry. */
  | "needs_more_work"
  /** No evidence. Never act on this. */
  | "unclassified";

export type Intervention = {
  cause: TerminalCause;
  kind: InterventionKind;
  /** One line a human reads in the notification centre. */
  summary: string;
  /** What the Supervisor would actually do, in plain words. */
  proposal: string;
  /** May `autonomy: "act"` carry this out without asking? */
  autoExecutable: boolean;
};

const TABLE: Record<TerminalCause, Omit<Intervention, "cause" | "autoExecutable">> = {
  completed: {
    kind: "unclassified",
    summary: "The run completed.",
    proposal: "Nothing to do.",
  },
  validation_environment: {
    kind: "retry_after_environment_fix",
    summary: "The checks could not run - the toolchain was missing, so the code was never actually tested.",
    proposal:
      "Install or start what the validation commands need, then re-run the task. Nothing is known to be wrong with the work itself yet.",
  },
  validation_failed: {
    kind: "needs_more_work",
    summary: "The checks ran and failed.",
    proposal:
      "Send the task back with the failing output attached. This is a real defect, so re-running it unchanged would fail the same way.",
  },
  policy_block: {
    kind: "needs_human_decision",
    summary: "A project policy refused the change.",
    proposal:
      "Read the named policy against the diff. Either the change should change, or the policy should - both are decisions for a person.",
  },
  spend_cap: {
    kind: "needs_budget_decision",
    summary: "A budget ceiling stopped the run.",
    proposal:
      "Raise the ceiling or narrow the task, then re-run. Retrying without changing either would stop at the same place.",
  },
  provider_exhausted: {
    kind: "needs_human_decision",
    summary: "The provider gave up after retries, without naming a defect.",
    proposal:
      "Look at the last turn before deciding. This is the case where the run's own account of itself is least reliable, so it is not retried automatically.",
  },
  approval_expired: {
    kind: "needs_human_decision",
    summary: "The run asked for a decision and nobody answered, so it stopped uncertified.",
    proposal:
      "Answer the request, or re-run with the approval configured. The work may be fine - it was never certified, which is not the same as being wrong.",
  },
  review_unresolved: {
    kind: "needs_more_work",
    summary: "The reviewer kept asking for changes until the loop budget ran out.",
    proposal:
      "Read the outstanding findings. Either raise the loop budget or narrow the task; another identical pass is unlikely to converge.",
  },
  error: {
    kind: "unclassified",
    summary: "The run threw.",
    proposal: "Read the error on the run before deciding anything.",
  },
  unknown: {
    kind: "unclassified",
    summary: "The run stopped and left no evidence of why.",
    proposal:
      "Open the run and look. Nothing is retried on absent evidence - that is how a loop spends a budget on a fault nobody has identified.",
  },
};

/** The Supervisor's proposal for a finished run. Pure. */
export function proposeIntervention(cause: TerminalCause): Intervention {
  const row = TABLE[cause];
  return {
    cause,
    ...row,
    // The acting gate is the deterministic one, NOT the table's opinion.
    autoExecutable: isAutoRemediable(cause),
  };
}

/**
 * Does this run want the Supervisor's attention at all?
 *
 * A completed run does not. Everything else does, including the ones the
 * Supervisor will refuse to act on - especially those, since a silent refusal
 * is how a stuck delivery looks like a finished one.
 */
export function wantsIntervention(cause: TerminalCause | null): boolean {
  return cause !== null && cause !== "completed";
}

/**
 * The notification the Supervisor raises. `actionRequired` is true whenever a
 * person has to do something - which is every case the Supervisor cannot
 * execute itself.
 */
export function interventionNotification(input: {
  intervention: Intervention;
  runId: string;
  taskId?: string | null;
  /** The resolved autonomy setting, so the message says what WILL happen. */
  autonomy: "advise" | "act";
}): NotificationDraft {
  const { intervention: i, autonomy } = input;
  const willAct = autonomy === "act" && i.autoExecutable;
  return {
    severity: willAct ? "info" : "attention",
    category: "run",
    title: willAct
      ? `Supervisor is handling: ${i.summary}`
      : `Supervisor wants to step in: ${i.summary}`,
    message: willAct
      ? `${i.proposal}\n\nAutonomy is set to "act", so the Supervisor is doing this now.`
      : `${i.proposal}\n\n${
          i.autoExecutable
            ? 'Set supervisor autonomy to "act" to let the Supervisor do this without asking.'
            : "The Supervisor will not do this on its own - it needs a decision from you."
        }`,
    runId: input.runId,
    taskId: input.taskId ?? null,
    actionRequired: !willAct,
    actionLabel: willAct ? null : "Open the run",
    actionUrl: `#/runs/${input.runId}`,
    sourceEventType: "supervisor.intervention",
    metadata: {
      cause: i.cause,
      kind: i.kind,
      autoExecutable: i.autoExecutable,
      autonomy,
    },
  };
}

/**
 * The autonomy actually in force, resolved against BOTH controls.
 *
 * The autonomy gate's rule is that two independent controls must agree: the
 * standing config setting and the on-disk pause flag, which fails closed. A
 * paused Supervisor proposes and never acts, whatever the config says - the
 * stop button has to work even when the config is what someone is unhappy
 * about. Any error reading the flag reads as paused, for the same reason.
 */
export async function resolveSupervisorAutonomy(
  projectRoot: string,
  control: { autonomy: "advise" | "act" },
): Promise<"advise" | "act"> {
  if (control.autonomy !== "act") return "advise";
  try {
    const pause = await readPauseState(projectRoot);
    return pause.paused ? "advise" : "act";
  } catch {
    return "advise";
  }
}
