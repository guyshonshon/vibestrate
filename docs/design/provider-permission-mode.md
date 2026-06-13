# Provider permission mode (write capability reaches the CLI)

Status: **SHIPPED (0.7.32).**

## The bug

A run with a `code_write` executor seat (default flow, strict-apply-only OFF)
ended `BLOCKED`: the executor agent could not write its deliverable. Its own
output: *"Write tool -> 'haven't granted it yet' (3 attempts)"*. No file landed.

The action broker had `allow`ed every step (provider.spawn, command.run) - it
does not broker per-file CLI writes. So nothing in Vibestrate denied the write.

## Root cause

There are **two** permission gates, and only the first was open:

1. **Vibestrate's gate** - the seat's `permissions` profile (`code_write` =>
   `allowWrite: true`) governs the action broker and the apply/validate routes.
2. **The CLI's own gate** - `claude` has its own permission system. Headless
   `claude -p` runs in the `default` permission mode, where the Write/Edit tools
   require an interactive grant. With no human in a headless run, every write is
   denied.

Vibestrate's `code_write` was never translated into the claude CLI's permission
mode. So a write-capable seat carried a permission that stopped at Vibestrate's
own boundary and never reached the tool that actually edits files.

## Fix (native, capability-keyed)

The write capability is derived from the turn's **resolved, post-override**
permission profile and threaded to the provider:

- `ProviderRunInput.allowWrite?: boolean` - set by the orchestrator to
  `profile.allowWrite`, where `profile` is resolved from `effectivePermissions`
  (already collapsed to `read_only` for `this.readOnly` investigation runs and
  for strict-apply-only). So read-only seats, investigation runs, and apply-only
  runs all resolve to `allowWrite: false` and get **no** grant. Keying on the
  capability (not the seat name) also covers custom permission profiles.
- The `claude-code` provider injects `--permission-mode acceptEdits` when
  `allowWrite` is true **and** the user has not set an explicit
  `settings.permissionMode` (explicit config always wins). `acceptEdits`
  auto-approves file create/edit inside the working dir (the worktree) - verified
  empirically that headless `claude -p --permission-mode acceptEdits` creates a
  new file with no prompt.
- This lives in the `claude-code` provider only. A generic `cli` provider is left
  untouched on purpose: `--permission-mode` is claude-specific and would break
  other CLIs (gemini, codex, aider, ...). Claude users should run the canonical
  `type: claude-code` provider.

## Scope / honesty

- **It is a write grant, not a shell grant.** The built-in `code_write` profile is
  also `allowShell: true`, but `acceptEdits` only auto-approves file edits (plus a
  small file-op allowlist). Commands run through Vibestrate's `command.run` broker,
  not claude's own Bash, so the executor's normal job (write code, then Vibestrate
  validates) is covered. A turn that tries an un-approved claude Bash call will
  *stall to the turn timeout* rather than fail fast - a known headless caveat of
  `acceptEdits`.
- **Read-only enforcement: now opt-in explicit (`policies.hardenReadOnlySeats`,
  0.7.75).** By default read-only seats still get no flag - their no-write rides
  on claude's headless default (writes prompt -> no approver -> can't write),
  enforcement-by-omission. Turning on `policies.hardenReadOnlySeats` runs a
  read-only claude seat under `--permission-mode plan`, so the CLI itself refuses
  writes (the agent won't even *attempt* them, avoiding the wasted retry/stall the
  default path incurs). Shipped OFF by default after a headless smoke established
  the tradeoff empirically: plan mode does **not** distort a read-only review turn
  (it produced normal findings and touched nothing), but it does add an "awaiting
  approval to exit plan mode" framing to an *action-shaped* prompt - so it stays
  opt-in rather than forced on every read-only seat. Write capability and an
  explicit `settings.permissionMode` both take precedence; codex read-only seats
  use `execution.isolation: sandboxed` (real OS confinement) instead.

## Why this design (rejected alternatives)

- **Pointed config patch** (add `--permission-mode acceptEdits` to one project's
  `cli` provider args): fixes one project, leaves the product broken; rejected.
- **Command-sniff the generic `cli` provider** (basename === "claude"): fragile,
  wrong for wrappers, smuggles claude knowledge into the generic path; rejected.
- **`bypassPermissions` as the default grant**: complete but the docs restrict it
  to isolated containers/VMs (no prompt-injection protection); violates the
  least-privilege posture. Rejected as a default.

## Review

Pressure-tested by an independent Opus review before implementation. It confirmed
the privilege-escalation path is safe **iff** keyed on the post-override
`profile.allowWrite` (not the seat name / pre-override profile) and required a
regression test that an apply-only / read-only `code_write` run emits no flag -
both adopted (see `tests/claude-write-permission.test.ts`). It also flagged that
migrating a provider `cli -> claude-code` turns on session reuse
(`--session-id`/`--resume`); that was verified to work with the installed claude
and is owned, not hidden.
