import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  proposeIntervention,
  wantsIntervention,
  interventionNotification,
  resolveSupervisorAutonomy,
} from "../src/supervisor/blocker-intervention.js";
import { setPaused } from "../src/supervisor/autonomy-gate.js";

/**
 * The Supervisor's answer to a run that did not complete.
 *
 * The property under test is restraint, not coverage: it must speak up about
 * every non-completed run, and act on almost none of them.
 */
describe("the Supervisor proposes for every stop, and acts for almost none", () => {
  it("speaks up about every non-completed cause", () => {
    for (const c of [
      "validation_environment", "validation_failed", "policy_block", "spend_cap",
      "provider_exhausted", "approval_expired", "review_unresolved", "error", "unknown",
    ] as const) {
      expect(wantsIntervention(c), `${c} must raise an intervention`).toBe(true);
      const i = proposeIntervention(c);
      expect(i.summary.length, `${c} needs a human-readable summary`).toBeGreaterThan(10);
      expect(i.proposal.length).toBeGreaterThan(10);
    }
    expect(wantsIntervention("completed")).toBe(false);
    expect(wantsIntervention(null)).toBe(false);
  });

  it("only an environment fault is auto-executable", () => {
    expect(proposeIntervention("validation_environment").autoExecutable).toBe(true);
    // Everything else - especially exhaustion, the case where the run's own
    // account of itself is least reliable.
    for (const c of [
      "provider_exhausted", "unknown", "validation_failed", "policy_block",
      "spend_cap", "approval_expired", "review_unresolved", "error",
    ] as const) {
      expect(proposeIntervention(c).autoExecutable, `${c} must not self-execute`).toBe(false);
    }
  });

  it("a refusal is still announced - a silent one hides a stuck delivery", () => {
    const n = interventionNotification({
      intervention: proposeIntervention("provider_exhausted"),
      runId: "r1",
      autonomy: "act",
    });
    // autonomy is "act", but this cause is not auto-executable, so the
    // notification must still demand a human.
    expect(n.severity).toBe("attention");
    expect(n.actionRequired).toBe(true);
    expect(n.title).toContain("wants to step in");
  });

  it("says it is handling it only when it truly will", () => {
    const acting = interventionNotification({
      intervention: proposeIntervention("validation_environment"),
      runId: "r1",
      autonomy: "act",
    });
    expect(acting.actionRequired).toBe(false);
    expect(acting.title).toContain("is handling");

    const advising = interventionNotification({
      intervention: proposeIntervention("validation_environment"),
      runId: "r1",
      autonomy: "advise",
    });
    expect(advising.actionRequired).toBe(true);
    expect(advising.message).toContain('autonomy to "act"');
  });
});

describe("the kill switch outranks the config", () => {
  it("a paused Supervisor never acts, even set to act", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sup-"));
    expect(await resolveSupervisorAutonomy(dir, { autonomy: "act" })).toBe("act");
    await setPaused(dir, true, "stop");
    // Mutation check: drop the pause read from resolveSupervisorAutonomy and
    // this returns "act" - the stop button becomes decorative.
    expect(await resolveSupervisorAutonomy(dir, { autonomy: "act" })).toBe("advise");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("advise is never promoted", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sup2-"));
    expect(await resolveSupervisorAutonomy(dir, { autonomy: "advise" })).toBe("advise");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
