# Native Windows Support — Slice B (full core loop)

Status: approved design, not yet implemented (2026-06-23).
Owner: E1 (backlog "Windows support").
Verification backbone: GitHub Actions `windows-latest` CI job.

## Goal

A Windows user can install Vibestrate, configure providers, **run agent
orchestrations**, review diffs, and merge - all on native Windows
(PowerShell / cmd, no WSL). This is "true support of the core loop", not a
best-effort port.

Sole documented carve-out: the in-app **integrated terminal tab** stays
WSL-only on native Windows. It is a convenience feature built on `node-pty`
+ a POSIX shell; carving it out is a deliberate scope cut (revisitable as a
later "Slice C"), not a hidden gap.

Non-goals (this program): the integrated terminal on native Windows (ConPTY);
WSL-bridge / cross-boundary serving; making providers that are themselves
WSL-only run natively (we flag those per-provider, we don't port them).

## Why "full core loop" and not "cockpit only"

The dashboard is served by the engine. A native-Windows dashboard that cannot
*run* agents has little to show, so "cockpit only" is an awkward half-state.
Slice B makes Windows users able to actually use the product; the single
carve-out is cleanly bounded and documented. (Considered and rejected: "Slice A
cockpit only" - too little value; "Slice C everything" - adds only the terminal
at the worst effort-to-value ratio.)

## Shape: audit-and-port, CI-first

This is not greenfield. It is one new seam plus targeted ports across a known,
bounded set of POSIX-only sites. The first phase adds the Windows CI job
**before** porting anything, so the real failure list comes from
`windows-latest`, not from guesses made on macOS.

### The known POSIX-hostile sites (from the 2026-06-23 audit grep)

Already partially guarded (opportunistic `process.platform !== "win32"`):
- `src/scheduler/scheduler-service.ts:64,75` - `-pid` process-group kill,
  already falls back to `child.kill` on Windows.
- `src/execution/command-runner.ts:90` - `detached` only off-Windows.
- `src/cli/commands/ui.ts`, `src/shell/ink/runner/command-runner.ts`,
  `src/cli/commands/workspace.ts` - browser-open already handles `win32`.

Unguarded / needs work:
- `src/workspace/workspace-runtime.ts:390,396` - `process.kill(pid,"SIGTERM"/"SIGKILL")`,
  POSIX signal semantics.
- `src/scheduler/scheduler-lock.ts:138,144` - same.
- `src/core/orchestrator.ts` abort path - SIGTERM to provider subprocess tree.
- `src/terminal/terminal-service.ts:335` - hardcodes `/bin/zsh|bash|sh` (the
  carve-out feature).
- Provider spawn via `execa` (`src/execution/command-runner.ts:101`,
  `src/providers/*`) - npm-installed provider CLIs are `*.cmd` shims on Windows.
- `src/core/artifact-store.ts:76` - `O_NOFOLLOW` is a no-op on Windows; the
  symlink defense degrades to a non-atomic `lstat` (security decision below).
- Manual `/` path splits (audit pass; most code already uses `path.*`).

`node-pty` consumers (the carve-out surface): `src/terminal/terminal-types.ts`,
`src/terminal/terminal-driver.ts`, `src/server/routes/terminal.ts`,
`src/project/init-template.ts`. Note: `node-pty` is a native dependency, so it
must still **install** on Windows (it ships ConPTY prebuilds). The carve-out is
runtime-only - we disable the terminal feature, we do not remove the dependency.

## Architecture: the platform seam

Introduce `src/platform/` to centralize every POSIX-only behavior behind a
small, tested interface. POSIX behavior stays byte-identical (the seam delegates
to today's code on non-Windows); Windows logic lives in one place and is unit
-testable with a mocked platform.

- `killProcessTree(pid, signal)` -
  - POSIX: `process.kill(-pgid, signal)` (today's behavior).
  - Windows: `taskkill /PID <pid> /T /F` (kills the process tree; no new
    dependency). Chosen over the `tree-kill` npm package - `taskkill` is the
    documented Windows mechanism and avoids a dependency.
- `spawnDetached(cmd, args, opts)` - daemon survival across parent exit.
  Windows: `{ detached: true, windowsHide: true }`, no `setsid`/`-pgid`.
- `signals` - normalize the SIGINT/SIGTERM handler wiring; Windows console-ctrl
  equivalents where a handler currently assumes POSIX signals.

Consumers (scheduler, workspace-runtime, scheduler-lock, orchestrator abort)
call the seam instead of `process.kill(-pid, ...)` directly.

## Security decision: symlink defense on Windows

`O_NOFOLLOW` makes the artifact-store symlink refusal atomic on POSIX. On
Windows it is a no-op, leaving a non-atomic `lstat`-then-open TOCTOU window.
**Decision: fail closed on Windows** - refuse symlinked artifact/worktree leaf
paths (and a symlinked parent) outright rather than accept the race. A noisy
refusal is recoverable; a TOCTOU symlink escape is not. This matches the repo's
"prefer refusal + clear error to silent success" posture.

## CI design (the verification backbone)

Extend `.github/workflows/ci.yml` with a `windows-latest` job that mirrors the
existing Ubuntu job: `pnpm install --frozen-lockfile` -> `pnpm typecheck` ->
`pnpm build` -> `pnpm test`. Build-before-test is preserved (a test spawns
`dist/index.js`). Add a focused Windows **fake-provider `vibe run` smoke** so
the spawn/worktree/diff/commit path is genuinely exercised on Windows, not just
unit-tested. Use a job matrix (`ubuntu-latest`, `windows-latest`) so both gate
PRs.

This job is what makes native code written from macOS honest: no "Windows works"
claim ships without the green Windows job behind it.

## Phasing (one branch per phase, per repo convention)

| Phase | Scope | Verifiable exit |
|---|---|---|
| 1 - Audit + CI | Add `windows-latest` matrix job FIRST; catalogue every failing site from real CI output; introduce `src/platform/` seam with POSIX behavior unchanged | Windows CI runs green for the parts that already work; failure list is empirical |
| 2 - Process control | `killProcessTree` + `spawnDetached` + signal wiring on Windows; port scheduler, workspace-runtime, scheduler-lock, orchestrator abort | Scheduler start/stop + run abort green on Windows CI |
| 3 - Provider spawn + paths | execa `*.cmd` shim resolution, path-handling audit/fixes, per-provider Windows-availability flagged in `vibe doctor` | Fake-provider `vibe run` smoke green on Windows CI |
| 4 - Carve-out + docs | Terminal disabled-with-guidance on native Windows; symlink fail-closed; docs (`docs/content/*`, README) | Full suite + smoke green; honest docs; per-provider matrix documented |

Each phase ends with the standard final report and merges independently. The
implementation phases (2, 3, 4) touch process control, signals, and security,
so each gets an independent Tier-2 review before merge.

## Open unknowns (resolved empirically, not asserted)

1. **execa `*.cmd` resolution** [inference] - does execa v9 spawn npm-shim
   `claude.cmd` / `*.bat` providers on Windows without `shell: true`? Failure
   mode: every provider spawn fails. Resolved in Phase 3 Windows CI. If it does
   not, the fix is explicit Windows extension resolution or a guarded
   `shell: true` for the provider command only.
2. **`node-pty` install on Windows** [inference] - the native dep must build /
   fetch prebuilds during `pnpm install` on `windows-latest`. Resolved in Phase
   1 CI (install step). If it fails, it blocks the whole package, not just the
   terminal - so it is a Phase-1 gate, not a Phase-4 concern.
3. **Per-provider native Windows support** [guess] - Claude Code runs natively;
   others (codex, gemini, ...) unknown. Flagged per-provider in `vibe doctor`,
   never faked. Not a blocker for the slice.

## Testing strategy

- Unit tests for the `platform/` seam with a mocked platform (both branches
  covered) - runs on every OS.
- Existing suite must stay green on POSIX (the seam must be a no-op refactor
  there).
- `windows-latest` CI runs the full suite + the fake-provider `vibe run` smoke.
- Providers are faked in tests per repo policy; no real provider CLI in CI.

## Honesty constraints

- No "Windows supported" claim without the green `windows-latest` job.
- The integrated-terminal carve-out is documented, not hidden.
- `node-pty` is carved out at runtime only; it still installs.
- Per-provider availability is flagged, never assumed.
