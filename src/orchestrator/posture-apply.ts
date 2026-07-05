// ── Posture-applies ─────────────────────────────────────────────────────────
//
// A run's *suggested* posture (sandbox-suggested / approval-suggested, set by the
// --select LLM selector or a persona's prefersPosture nudge) is advisory by
// default. When the user opts in per-posture (config `posture.autoApplySandbox` /
// `autoApplyApproval`), a suggested posture is APPLIED to this run: sandbox-suggested
// -> execution.isolation: sandboxed, approval-suggested -> permissionMode: ask.
//
// This module is the single, pure decision point. It is deliberately
// provider-agnostic: there is no run-level provider (providers resolve per-seat,
// per-turn), so codex-yes/claude-no degradation is left to the orchestrator's
// existing per-seat sandbox request+degrade path. The override here can only ever
// RAISE isolation (off -> sandboxed) and only ever inject `ask` - it can never
// lower safety. See docs/superpowers/specs/2026-06-22-slice-2b-posture-applies-design.md.

import type { WorkflowPosture } from "./select-workflow.js";
import type { PermissionMode, PostureConfig } from "../project/config-schema.js";

export type PostureApplyInput = {
  posture: WorkflowPosture;
  config: { autoApplySandbox: boolean; autoApplyApproval: boolean };
  /** The user set --permission-mode / spec.permissionMode explicitly. */
  explicitPermissionMode: boolean;
  /** The run is --unattended (an approval gate would stall it). */
  unattended: boolean;
};

export type PostureApplyResult = {
  /** Set => override this run's execution.isolation (only ever "sandboxed"). */
  isolation?: "sandboxed";
  /** Set => override this run's permissionMode (only ever "ask"). */
  permissionMode?: "ask";
  /** Human-facing notes: what was applied or why it was suppressed. */
  notes: string[];
};

export function derivePostureApplication(input: PostureApplyInput): PostureApplyResult {
  if (input.posture === "sandbox-suggested" && input.config.autoApplySandbox) {
    return { isolation: "sandboxed", notes: ["sandbox posture applied (auto)"] };
  }
  if (input.posture === "approval-suggested" && input.config.autoApplyApproval) {
    if (input.explicitPermissionMode) {
      return {
        notes: ["approval suggested, not applied (permission mode set explicitly)"],
      };
    }
    if (input.unattended) {
      return { notes: ["approval suggested, suppressed (unattended)"] };
    }
    return { permissionMode: "ask", notes: ["approval posture applied (auto)"] };
  }
  return { notes: [] };
}

export type ResolveRunPostureInput = {
  posture: WorkflowPosture;
  config: PostureConfig;
  /** The explicit per-run permission mode (spec.permissionMode), if any. */
  specPermissionMode: PermissionMode | null | undefined;
  /** The no-write / read-only clamp the launcher already decided for this run. */
  readOnly: boolean;
  unattended: boolean;
};

export type ResolveRunPostureResult = {
  /** The permission mode to hand the Orchestrator (undefined => its own default). */
  permissionMode: PermissionMode | undefined;
  /** A per-run isolation override (undefined => use config.execution.isolation). */
  isolationOverride: "sandboxed" | undefined;
  notes: string[];
};

/**
 * Fold an applied posture into the run's effective permissionMode + isolation
 * override. Precedence for permissionMode: explicit `--permission-mode` > the
 * read-only/no-write clamp > the auto-applied approval posture. Isolation is only
 * ever RAISED to sandboxed. Pure - the launcher passes the result to the Orchestrator.
 */
export function resolveRunPosture(input: ResolveRunPostureInput): ResolveRunPostureResult {
  const applied = derivePostureApplication({
    posture: input.posture,
    config: input.config,
    explicitPermissionMode: input.specPermissionMode != null,
    unattended: input.unattended,
  });
  const permissionMode: PermissionMode | undefined =
    input.specPermissionMode ??
    (input.readOnly ? "read-only" : (applied.permissionMode ?? undefined));
  return {
    permissionMode,
    isolationOverride: applied.isolation,
    notes: applied.notes,
  };
}
