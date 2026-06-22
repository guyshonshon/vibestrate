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
};

type PostureApplyResult = {
  isolation?: "sandboxed";             // set => override this run's isolation
  permissionMode?: "ask";              // set => override this run's permissionMode
  notes: string[];                     // human-facing: applied / suppressed, with the reason
};
```

Rules:

1. `posture === "sandbox-suggested"` and `config.autoApplySandbox` ->
   `isolation: "sandboxed"`, `note: "sandbox posture applied (auto)"`.
   - **No provider check here** (Tier-2 review #2): there is no run-level
     provider - provider is resolved per-seat per-turn
     ([`orchestrator.ts:4851`](../../../src/core/orchestrator.ts)). The
     orchestrator already always REQUESTS the sandbox and degrades honestly
     per-seat: a seat whose provider can't sandbox (claude) emits
     `provider.sandbox_unavailable` + a one-time warning (orchestrator.ts:5311-5323),
     and run-assurance derives the real posture from those per-turn events. So
     setting the override unconditionally is correct on mixed-provider flows and
     reuses the existing degradation instead of re-guessing it.
   - The override only ever RAISES off -> sandboxed (a no-op if config is already
     sandboxed) and can never lower isolation (the result type is `"sandboxed"`
     only) - so there is no explicit-off to respect.
2. `posture === "approval-suggested"` and `config.autoApplyApproval`:
   - `explicitPermissionMode` true -> do nothing
     (`note: "approval suggested, not applied (permission mode set explicitly)"`).
   - `unattended` true -> do nothing
     (`note: "approval suggested, suppressed (unattended)"`).
   - else -> `permissionMode: "ask"`, `note: "approval posture applied (auto)"`.
3. `posture === "normal"` or the relevant flag off -> empty result (no notes).

`explicit > auto` for permissionMode is enforced here, so no call site can
accidentally override a user's `--permission-mode`.

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
  No config file mutation. No provider check here - the orchestrator's existing
  per-seat request+degrade path (5311-5323) handles codex-yes/claude-no.

## 7. Records + surfaces (UI<->CLI parity)

- Record the applied posture outcome (the `notes` + the effective isolation/
  permissionMode) on the run's selection record / run state, next to the existing
  posture field. (This persisted record is also what resume reads - see section 8a.)
- Surface in: the `vibe assurance` isolation/posture line; the dashboard "Flow &
  why" / Supervisor panel; the CLI run selection line. When an approval posture is
  suppressed (unattended/explicit), the surface says so verbatim.
- **Per-seat, not run-level (Tier-2 review #6b):** do NOT print a run-level
  "sandbox unavailable" line - that would be false for the codex seats on a
  mixed-provider flow. Sandbox availability is already surfaced per-seat by the
  existing `provider.sandbox_unavailable` events + the run-assurance isolation
  posture (sandboxed / partial / none); reuse that, don't add a run-level claim.

## 8. Safety invariants (must hold)

- Opt-in: both flags default false.
- Explicit `--permission-mode` always wins over an auto-applied approval posture.
- Isolation is only ever RAISED (off -> sandboxed), never lowered; an
  already-sandboxed config is a no-op. There is no per-run explicit-off to override
  (the result type is `"sandboxed"` only - it structurally cannot emit "off").
- Codex-only sandbox is never over-claimed; claude degrades per-seat via the
  existing runtime path, not a pre-run guess.
- Never mutates the config file.
- The no-write/read-only diff-gate clamp is unchanged and still wins over an
  applied approval posture.

### 8a. Known limitation: approval posture + non-interactive (Tier-2 review #4)

`unattended` is NOT the same as non-interactive. An applied `permissionMode: ask`
on a run that is headless but was launched WITHOUT `--unattended` and has no one to
answer the approval (no TTY, no dashboard) will wait on the orchestrator's approval
poll (orchestrator.ts:4634) indefinitely - the same footgun as setting
`--permission-mode ask` explicitly in that environment. This is documented, not
silently mitigated: `autoApplyApproval: true` is an opt-in, and a user who also
runs headless without `--unattended` is mis-configured. We suppress only for the
reliable `unattended` signal; we do not claim "never stalls."

### 8b. Resume (Tier-2 review #6a)

On resume, `selection` is null (run-launcher.ts:264), so the posture is not
re-derived. A resumed run MUST keep the confinement/gating it was launched with -
silently dropping a sandbox or approval gate on resume is a fail-open. Because the
effective isolation + permissionMode are persisted on run state (section 7), the
resume path reads them back from the source run's state and re-applies them
(isolation via the same `isolationOverride`, permissionMode via the existing
per-run field). No re-derivation, no LLM - just rehydrate the persisted effective
values.

## 9. Tests

- Pure `derivePostureApplication` table: `posture {normal, sandbox-suggested,
  approval-suggested}` x `flag {on, off}` x `explicit {set, unset}` x `unattended
  {y, n}` -> expected `{isolation?, permissionMode?, notes}`. (No provider axis -
  the function is provider-agnostic by design.)
- run-launcher integration (fake providers only):
  - sandbox-suggested + autoApplySandbox -> effective `isolationOverride = sandboxed`
    threaded to the Orchestrator; assert the assurance isolation event reflects it
    (sandboxed on codex / partial on claude), NOT just the override field.
  - approval-suggested + autoApplyApproval + attended -> permissionMode `ask`.
  - approval-suggested + autoApplyApproval + unattended -> unchanged + "suppressed" note.
  - explicit `--permission-mode auto` + approval posture -> stays `auto` (explicit wins).
  - no-write flow + approval posture -> still read-only-clamped.
  - resume of a sandbox/ask run -> rehydrates the same isolation/permissionMode
    (selection is null) instead of dropping them.
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
