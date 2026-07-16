export class __ApprovalRejectedSignal extends Error {
  constructor() {
    super("Run blocked after approval rejected");
    this.name = "ApprovalRejectedSignal";
  }
}

export class __RunAbortedSignal extends Error {
  constructor() {
    super("Run aborted by user signal");
    this.name = "RunAbortedSignal";
  }
}

/** Thrown when the daily spend cap is hit and the action is (or falls back to)
 *  "stop" - the run() loop catches it and blocks the run with this message. */
export class __SpendCapStopSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapStopSignal";
  }
}

/** Thrown when the Action Broker denies (or requires unavailable approval for)
 *  a proposed effect. Fail-closed: the run() loop catches it and blocks the
 *  run rather than failing it - the decision is already recorded as evidence. */
export class __ActionDeniedSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionDeniedSignal";
  }
}

/** Thrown when a count/time budget ceiling is hit (unattended-resilience).
 *  Like the spend cap, the run() loop catches it and blocks the run (not fails)
 *  - hitting a configured ceiling is an intentional stop, not an error. */
export class __BudgetLimitSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetLimitSignal";
  }
}

/** Control-flow signals that must ALWAYS propagate - they are not ordinary
 *  step failures and must never be swallowed by continueOnError. An
 *  aborted/approval-rejected/spend-capped/denied run has to unwind regardless. */
export function __isControlSignal(err: unknown): boolean {
  return (
    err instanceof __ApprovalRejectedSignal ||
    err instanceof __RunAbortedSignal ||
    err instanceof __SpendCapStopSignal ||
    err instanceof __ActionDeniedSignal ||
    err instanceof __BudgetLimitSignal
  );
}
