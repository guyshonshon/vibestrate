import { describe, it, expect } from "vitest";
import {
  derivePostureApplication,
  resolveRunPosture,
} from "../src/orchestrator/posture-apply.js";

const cfg = (autoApplySandbox: boolean, autoApplyApproval: boolean) => ({
  autoApplySandbox,
  autoApplyApproval,
});

describe("derivePostureApplication", () => {
  it("does nothing for a normal posture", () => {
    const r = derivePostureApplication({
      posture: "normal",
      config: cfg(true, true),
      explicitPermissionMode: false,
      unattended: false,
    });
    expect(r).toEqual({ notes: [] });
  });

  it("does nothing when the sandbox flag is off", () => {
    const r = derivePostureApplication({
      posture: "sandbox-suggested",
      config: cfg(false, true),
      explicitPermissionMode: false,
      unattended: false,
    });
    expect(r).toEqual({ notes: [] });
  });

  it("applies sandbox isolation when sandbox-suggested + flag on (no provider check)", () => {
    const r = derivePostureApplication({
      posture: "sandbox-suggested",
      config: cfg(true, false),
      explicitPermissionMode: false,
      unattended: false,
    });
    expect(r.isolation).toBe("sandboxed");
    expect(r.permissionMode).toBeUndefined();
    expect(r.notes).toEqual(["sandbox posture applied (auto)"]);
  });

  it("does nothing when the approval flag is off", () => {
    const r = derivePostureApplication({
      posture: "approval-suggested",
      config: cfg(true, false),
      explicitPermissionMode: false,
      unattended: false,
    });
    expect(r).toEqual({ notes: [] });
  });

  it("applies ask when approval-suggested + flag on + attended + not explicit", () => {
    const r = derivePostureApplication({
      posture: "approval-suggested",
      config: cfg(false, true),
      explicitPermissionMode: false,
      unattended: false,
    });
    expect(r.permissionMode).toBe("ask");
    expect(r.isolation).toBeUndefined();
    expect(r.notes).toEqual(["approval posture applied (auto)"]);
  });

  it("suppresses the approval gate under unattended (no stall)", () => {
    const r = derivePostureApplication({
      posture: "approval-suggested",
      config: cfg(false, true),
      explicitPermissionMode: false,
      unattended: true,
    });
    expect(r.permissionMode).toBeUndefined();
    expect(r.notes).toEqual(["approval suggested, suppressed (unattended)"]);
  });

  it("never overrides an explicit permission mode (explicit > auto)", () => {
    const r = derivePostureApplication({
      posture: "approval-suggested",
      config: cfg(false, true),
      explicitPermissionMode: true,
      unattended: false,
    });
    expect(r.permissionMode).toBeUndefined();
    expect(r.notes).toEqual([
      "approval suggested, not applied (permission mode set explicitly)",
    ]);
  });

  it("never emits an unknown posture branch", () => {
    expect(derivePostureApplication({
      posture: "sandbox-suggested",
      config: cfg(true, true),
      explicitPermissionMode: true, // irrelevant to sandbox
      unattended: true,             // irrelevant to sandbox
    }).isolation).toBe("sandboxed");
  });

  it("can only ever raise isolation to sandboxed, never emit off", () => {
    // Exhaustive over the inputs: no combination yields isolation other than
    // undefined or "sandboxed".
    for (const posture of ["normal", "sandbox-suggested", "approval-suggested"] as const) {
      for (const s of [true, false]) {
        for (const a of [true, false]) {
          for (const ex of [true, false]) {
            for (const un of [true, false]) {
              const r = derivePostureApplication({
                posture,
                config: cfg(s, a),
                explicitPermissionMode: ex,
                unattended: un,
              });
              expect(r.isolation === undefined || r.isolation === "sandboxed").toBe(true);
              expect(r.permissionMode === undefined || r.permissionMode === "ask").toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("resolveRunPosture (fold into effective run values)", () => {
  const base = {
    config: cfg(true, true),
    specPermissionMode: null,
    readOnly: false,
    unattended: false,
  };

  it("applies ask for approval-suggested when nothing explicit and not clamped", () => {
    const r = resolveRunPosture({ ...base, posture: "approval-suggested" });
    expect(r.permissionMode).toBe("ask");
    expect(r.isolationOverride).toBeUndefined();
  });

  it("read-only clamp wins over an applied approval posture", () => {
    const r = resolveRunPosture({
      ...base,
      posture: "approval-suggested",
      readOnly: true,
    });
    expect(r.permissionMode).toBe("read-only");
  });

  it("explicit --permission-mode wins over auto-applied approval", () => {
    const r = resolveRunPosture({
      ...base,
      posture: "approval-suggested",
      specPermissionMode: "auto",
    });
    expect(r.permissionMode).toBe("auto");
    // explicit-set note recorded
    expect(r.notes.join(" ")).toMatch(/explicit/i);
  });

  it("suppresses approval under unattended (permissionMode stays undefined)", () => {
    const r = resolveRunPosture({
      ...base,
      posture: "approval-suggested",
      unattended: true,
    });
    expect(r.permissionMode).toBeUndefined();
    expect(r.notes.join(" ")).toMatch(/suppressed \(unattended\)/);
  });

  it("threads the sandbox isolation override", () => {
    const r = resolveRunPosture({ ...base, posture: "sandbox-suggested" });
    expect(r.isolationOverride).toBe("sandboxed");
    expect(r.permissionMode).toBeUndefined();
  });

  it("normal posture yields no override, no permission change", () => {
    const r = resolveRunPosture({ ...base, posture: "normal" });
    expect(r.permissionMode).toBeUndefined();
    expect(r.isolationOverride).toBeUndefined();
    expect(r.notes).toEqual([]);
  });
});
