# Slice 2b — Posture-applies (design)

Status: approved design, pre-implementation.
Owner branch: `feat/posture-applies`.
Related: [`design/responsible-orchestrator.md`](../../design/responsible-orchestrator.md)
(Slice 2b), [`design/proportional-orchestration.md`](../../design/proportional-orchestration.md),
[`design/orchestrator-personas.md`](../../design/orchestrator-personas.md).

## 1. Goal

Make a run's *suggested* posture actually take effect. Today the orchestrator
can flag a run as `sandbox-suggested` or `approval-suggested` (from the `--select`
LLM selector or a persona's `prefersPosture` nudge), but the suggestion is purely
advisory - it is recorded and displayed and changes nothing about how the run
executes. Slice 2b lets a suggested posture set the run's `execution.isolation`
and/or `permissionMode`, **gated per-posture, opt-in, visible, and safe** under
the explicit-choice, unattended, and codex-only-sandbox constraints.

This is the "behavior-changing backend half" of the already-shipped read-only
"Flow & why" panel (0.7.78).

## 2. Current state (verified 2026-06-22)

- `WorkflowSelection.posture: "normal" | "sandbox-suggested" | "approval-suggested"`
  is set by the LLM selector (`selectWorkflow`,
  [`orchestrator/select-workflow.ts`](../../../src/orchestrator/select-workflow.ts))
  and by the persona posture nudge (`maybeUpgradeForPersona`, same file).
- The posture is consumed in exactly one place:
  [`core/orchestrator.ts:1028`](../../../src/core/orchestrator.ts) records
  `posture: this.selection.posture` for display. **Nothing acts on it.**
- The run's `permissionMode` comes from `spec.permissionMode ?? (readOnly ? "read-only" : undefined)`
  ([`core/run-launcher.ts:365`](../../../src/core/run-launcher.ts)) - independent of posture.
- `execution.isolation` is **config-only**: the orchestrator reads
  `this.config.execution?.isolation === "sandbox..."`
  ([`core/orchestrator.ts:5223`](../../../src/core/orchestrator.ts)) directly. There is
  no per-run isolation override today.
- For comparison, crew auto-selection already *is* applied:
  `effectiveCrewId = spec.crewId ?? selection?.crewId ?? null`
  ([`core/run-launcher.ts:293`](../../../src/core/run-launcher.ts)) is fed to
  `resolveFlow` and the Orchestrator. Posture-applies mirrors this `explicit ?? auto`
  shape.

## 3. Scope

In scope: **posture-applies only.** Out of scope (deferred follow-ups, logged in
`docs/TODO.md`): profile auto-selection (overlaps crew-bundled per-seat profiles);
crew auto-selection on default/non-`--select` runs (reintroduces an LLM turn on the
"free" default path).

## 4. Config — new `posture` section

```yaml
posture:
  autoApplySandbox: false    # sandbox-suggested  -> execution.isolation: sandboxed (this run only)
  autoApplyApproval: false   # approval-suggested -> permissionMode: ask (this run only)
```

- Both default **false** (opt-in, fail-closed - a behavior change is never the
  default; consistent with `execution.isolation`, `policies.hardenReadOnlySeats`).
- Added to `projectConfigSchema`
  ([`project/config-schema.ts`](../../../src/project/config-schema.ts)) as a new
  optional object with `.describe()` text on each field (feeds `config keys`).
- Granular per-posture (the chosen approach B): a user can enable sandbox-apply
  without approval-apply, or vice-versa.

## 5. The pure decision function

`derivePostureApplication` (new pure module, e.g.
`src/orchestrator/posture-apply.ts`) - no IO, fully unit-tested:

```ts
type PostureApplyInput = {
  posture: WorkflowPosture;            // from the selection
  config: { autoApplySandbox: boolean; autoApplyApproval: boolean };
  explicitPermissionMode: boolean;     // user set --permission-mode / spec.permissionMode
  unattended: boolean;                 // run is --unattended
  providerHasSandbox: boolean;         // run's provider supports a host sandbox (codex yes, claude no)
};

type PostureApplyResult = {
  isolation?: "sandboxed";             // set => override this run's isolation
  permissionMode?: "ask";              // set => override this run's permissionMode
  notes: string[];                     // human-facing: applied / suppressed / unavailable, with the reason
};
```

Rules:

1. `posture === "sandbox-suggested"` and `config.autoApplySandbox`:
   - `providerHasSandbox` false -> do nothing, `note: "sandbox suggested but unavailable on this provider"`.
   - else -> `isolation: "sandboxed"`, `note: "sandbox posture applied (auto)"`.
   Isolation has no per-run explicit flag; the override only ever RAISES off ->
   sandboxed (a no-op if the config is already sandboxed) and can never lower
   isolation, so there is no explicit-off to respect.
2. `posture === "approval-suggested"` and `config.autoApplyApproval`:
   - `explicitPermissionMode` true -> do nothing (note).
   - `unattended` true -> do nothing, `note: "approval posture suggested but suppressed (unattended)"`.
   - else -> `permissionMode: "ask"`, `note: "approval posture applied (auto)"`.
3. `posture === "normal"` or the relevant flag off -> empty result (no notes).

`explicit > auto` is enforced here, so no call site can accidentally override a
user choice.

## 6. Plumbing

- **permissionMode** is already per-run. At run-launcher.ts:365, fold the derived
  `permissionMode` in BELOW the read-only clamp so the clamp still wins for a
  no-write flow:
  `spec.permissionMode ?? (readOnly ? "read-only" : (derived.permissionMode ?? undefined))`.
  Precedence: explicit `--permission-mode` > read-only/no-write clamp > auto-applied
  approval posture. (A no-write flow with an approval posture stays read-only-clamped,
  per the section 9 test.)
- **isolation** needs a new per-run override. Add an optional `isolationOverride`
  field to the Orchestrator input (threaded from run-launcher) and change
  orchestrator.ts:5223 to read `(this.isolationOverride ?? this.config.execution?.isolation)`.
  No config file mutation. `providerHasSandbox` is derived the same way the
  existing codex-only sandbox check derives it (reuse, do not duplicate).

## 7. Records + surfaces (UI<->CLI parity)

- Record the applied posture outcome (the `notes` + the effective isolation/
  permissionMode) on the run's selection record / run state, next to the existing
  posture field.
- Surface in: the `vibe assurance` isolation/posture line; the dashboard "Flow &
  why" / Supervisor panel; the CLI run selection line. When suppressed or
  unavailable, the surface says so verbatim (no silent success).

## 8. Safety invariants (must hold)

- Opt-in: both flags default false.
- Explicit `--permission-mode` always wins over an auto-applied approval posture.
- Isolation is only ever RAISED (off -> sandboxed), never lowered; an
  already-sandboxed config is a no-op. There is no per-run explicit-off to override.
- Unattended never gets an unexpected approval stall.
- Codex-only sandbox is never over-claimed; claude degrades with a recorded note.
- Never mutates the config file.
- The no-write/read-only diff-gate clamp is unchanged and still wins over an
  applied approval posture.

## 9. Tests

- Pure `derivePostureApplication` table: `posture {normal, sandbox-suggested,
  approval-suggested}` x `flag {on, off}` x `explicit {set, unset}` x `unattended
  {y, n}` x `providerHasSandbox {y, n}` -> expected `{isolation?, permissionMode?,
  notes}`.
- run-launcher integration (fake providers only):
  - sandbox-suggested + autoApplySandbox + codex -> effective isolation `sandboxed`.
  - sandbox-suggested + autoApplySandbox + claude -> isolation unchanged + "unavailable" note.
  - approval-suggested + autoApplyApproval + attended -> permissionMode `ask`.
  - approval-suggested + autoApplyApproval + unattended -> unchanged + "suppressed" note.
  - explicit `--permission-mode auto` + approval posture -> stays `auto` (explicit wins).
  - no-write flow + approval posture -> still read-only-clamped.
- Config round-trip: the new `posture` keys validate, appear in `config keys`,
  set/get through the CLI + UI.

## 10. Out of scope / follow-ups

- Profile auto-selection (`profileId` in the selection) - deferred; crews already
  bundle per-seat profiles, so marginal value.
- Crew auto-selection on default (non-`--select`) runs - deferred; reintroduces an
  LLM turn on the free default path.

## 11. Verification

`pnpm typecheck`, `pnpm test`, `pnpm build`. Tier-2 review before merge (the change
flips run permission/isolation posture - a write-/safety-adjacent behavior change).
Never pushed/merged without explicit instruction.
