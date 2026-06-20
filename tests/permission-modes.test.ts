import { describe, it, expect, vi } from "vitest";
import {
  createActionBroker,
  POLICY_UNAVAILABLE_EVALUATOR,
  type ActionKind,
  type ActionRequest,
} from "../src/safety/action-broker.js";
import { permissionModeEvaluators } from "../src/core/orchestrator.js";

// ── P4 permission modes ──────────────────────────────────────────────────────
// The broker fail-closed seam + the mode -> evaluator mapping carry the
// enforcement; they're pure and run anywhere.

function req(kind: ActionKind): ActionRequest {
  return { runId: "r", kind, subject: {}, proposedBy: "system" };
}

// Write/outcome/irreversible kinds fail CLOSED on a policy-load error; git.merge
// is included (the most irreversible effect, human-initiated, so failing it
// closed just makes the user retry once policy loads).
const WRITE_OUTCOME: ActionKind[] = [
  "file.patch",
  "file.write",
  "run.complete",
  "git.merge",
];
const READ_ONLY_KINDS: ActionKind[] = [
  "provider.spawn",
  "command.run",
  "terminal.create",
  "network.request",
  "mcp.tool",
];

describe("broker fails CLOSED when the policy loader throws (P4)", () => {
  it("denies write/outcome effects, abstains (allows) read-only effects on a loader error", async () => {
    // A genuinely throwing loader (an fs error, not a malformed file - those are
    // swallowed upstream). The broker must NOT fall through to default-allow.
    const broker = createActionBroker("/tmp", "r", {
      evaluatorLoader: () => Promise.reject(new Error("fs boom")),
    });
    for (const kind of WRITE_OUTCOME) {
      expect((await broker.decide(req(kind))).effect, kind).toBe("deny");
    }
    // read-only / spawn kinds stay permissive so a transient fs error can't brick
    // every run (provider.spawn throwing would stop runs from starting).
    for (const kind of READ_ONLY_KINDS) {
      expect((await broker.decide(req(kind))).effect, kind).toBe("allow");
    }
  });

  it("an empty policy set (the default) still allows - the catch never fires", async () => {
    // No evaluatorLoader injected here means the real loader runs; with no
    // .vibestrate/policies it returns [] WITHOUT throwing, so default-allow holds.
    const broker = createActionBroker("/tmp/does-not-exist-xyz", "r");
    expect((await broker.decide(req("file.patch"))).effect).toBe("allow");
  });
});

describe("POLICY_UNAVAILABLE_EVALUATOR scope", () => {
  it("denies only write/outcome kinds, abstains on the rest", () => {
    for (const kind of WRITE_OUTCOME) {
      expect(POLICY_UNAVAILABLE_EVALUATOR(req(kind))?.effect, kind).toBe("deny");
    }
    for (const kind of READ_ONLY_KINDS) {
      expect(POLICY_UNAVAILABLE_EVALUATOR(req(kind)), kind).toBeNull();
    }
  });
});

describe("permission mode -> broker evaluators", () => {
  it("ask: every turn diff (file.patch) requires approval", () => {
    const evs = permissionModeEvaluators("ask");
    expect(evs).toHaveLength(1);
    expect(evs[0]!(req("file.patch"))?.effect).toBe("require_approval");
    expect(evs[0]!(req("provider.spawn"))).toBeNull();
    expect(evs[0]!(req("run.complete"))).toBeNull();
  });

  it("accept-edits: writes auto-apply, run completion requires approval", () => {
    const evs = permissionModeEvaluators("accept-edits");
    expect(evs).toHaveLength(1);
    expect(evs[0]!(req("run.complete"))?.effect).toBe("require_approval");
    expect(evs[0]!(req("file.patch"))).toBeNull(); // edits are NOT gated per-diff
  });

  it("auto and read-only inject no broker evaluators (auto = default; read-only = clamp)", () => {
    expect(permissionModeEvaluators("auto")).toEqual([]);
    expect(permissionModeEvaluators("read-only")).toEqual([]);
  });
});
