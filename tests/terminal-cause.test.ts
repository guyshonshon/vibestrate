import { describe, it, expect } from "vitest";
import {
  deriveTerminalCause,
  isAutoRemediable,
  isEnvironmentFault,
} from "../src/core/run/terminal-cause.js";

/**
 * Why a run ended, from the run's own evidence.
 *
 * The rule this enforces: a supervisor may act automatically ONLY where the
 * fault is deterministically knowable. Exhaustion - the case where a failing
 * system's account of itself is least reliable - must never be auto-retried,
 * and absent evidence must mean stop.
 */
const ev = (...types: string[]) => types.map((type) => ({ type }));

describe("terminal cause is read from evidence, not from prose", () => {
  it("a budget stop is a typed cause, not a substring of the error text", () => {
    expect(deriveTerminalCause({ status: "blocked", events: ev("spend.capped") })).toBe("spend_cap");
  });

  it("a named refusal beats exhaustion", () => {
    // Both signals present: reporting "ran out of road" would hide a real
    // policy finding, so the specific one wins.
    const cause = deriveTerminalCause({
      status: "blocked",
      events: [{ type: "provider.retries_exhausted" }, { type: "supervisor.policy_block", data: {} }],
    });
    expect(cause).toBe("policy_block");
  });

  it("an inert policy block is not a block", () => {
    expect(
      deriveTerminalCause({
        status: "blocked",
        events: [{ type: "supervisor.policy_block", data: { inert: true } }],
      }),
    ).toBe("unknown");
  });

  it("a missing toolchain outranks the failures it caused", () => {
    const cause = deriveTerminalCause({
      status: "blocked",
      events: [],
      validation: { summary: { failed: 3, environment: 1 } },
    });
    expect(cause).toBe("validation_environment");
  });

  it("an unanswered approval is 'not certified', not 'broken'", () => {
    expect(deriveTerminalCause({ status: "blocked", events: ev("approval.expired") })).toBe(
      "approval_expired",
    );
  });

  it("merge_ready is completed regardless of noise in the log", () => {
    expect(deriveTerminalCause({ status: "merge_ready", events: ev("provider.retries_exhausted") })).toBe(
      "completed",
    );
  });
});

describe("only a deterministic environment fault may be auto-remediated", () => {
  it("environment yes, exhaustion no", () => {
    expect(isAutoRemediable("validation_environment")).toBe(true);
    expect(isEnvironmentFault("validation_environment")).toBe(true);
    // The whole point: retrying exhaustion is how an autonomous loop burns a
    // budget without converging.
    expect(isAutoRemediable("provider_exhausted")).toBe(false);
  });

  it("absent evidence is never safe to retry", () => {
    expect(isAutoRemediable("unknown")).toBe(false);
  });

  it("a real defect is not an environment fault", () => {
    for (const c of ["validation_failed", "policy_block", "review_unresolved", "error", "spend_cap"] as const) {
      expect(isAutoRemediable(c), `${c} must not auto-retry`).toBe(false);
    }
  });
});
