# In-UI `vibe` command runner

Status: revised-after-review (2026-07-10)

## Context — the real goal

The floating "CLI" orb (`CliHintOverlay.tsx`, label "Run this on the CLI / TUI")
today is a one-way teaching surface: for the current page it shows a few
copy-pasteable `vibe …` strings (from `hintForRoute()` in
[`src/ui/lib/cli-hints.ts`](../../src/ui/lib/cli-hints.ts)) and a copy button.
It executes nothing.

The ask: let those commands run **inline**, so you don't have to switch to a
terminal, paste, and come back. The real need is in-context execution of the
**inspection** commands the button already shows (peek at status, ledger,
assurance, an audit) — not "a Unix shell in the browser."

That distinction is the whole design. A literal "small terminal" that runs
arbitrary commands is exactly what `CLAUDE.md` §5 forbids: *"No arbitrary shell
execution from HTTP"* and *"Browser/UI must never directly spawn arbitrary
commands."* So this is deliberately **not** a shell.

An adversarial review then reshaped the *how* (see Review trail): the first
draft spawned the `vibe` CLI binary over HTTP. That both duplicated data the
server already serves in-process **and** violated a load-bearing repo invariant
(`detached-run.ts:8-13`: the dashboard drives the core "never the `vibe` CLI
binary — so UI ⇄ CLI stay decoupled and every launch goes through one audited
core path"). The revised design runs **nothing as a subprocess**. It dispatches
each allowlisted command to the same in-process service function the CLI command
wraps, and renders that command's text output. From the user's seat it is still
"run the command inline and see its output"; under the hood it is a typed
read-only query, like every other dashboard route.

Owner decisions (2026-07-10, before design):

- **Shape = a `vibe` command runner, not a terminal.** (Rejected: a project-root
  PTY shell — the arbitrary-shell-from-HTTP line.)
- **Scope = read-only / inspection commands only.** Write/exec subcommands
  (`run`, `config set`, `integrate finish`, `policies add`, `learn` refresh)
  stay copy-only; they already have real UI actions, so the runner never becomes
  a UI⇄CLI parity bypass.

## What exists vs proposed vs foundation

| Component | Status | Evidence |
|---|---|---|
| CLI orb popover + per-route command strings | **EXISTS** | `CliHintOverlay.tsx:74,110-189`; `cli-hints.ts:32-446` (copy-to-clipboard only) |
| In-process service functions behind each read command | **EXISTS** | `getConfigValue` returns structured data (`setup/config-update-service.ts:109`); `readActionLog` (`safety/action-broker.ts:230`); ledger/flows/params/policies services already power `server/routes/{config,flows,params,policies}.ts` |
| Integrated PTY terminal (arbitrary shell, worktree-scoped) | **EXISTS, not reused** | `terminal.ts`/`TerminalPanel.tsx`; project root hard-refused (`terminal-service.ts:276-281`); opt-in `allowInteractiveTerminal`. Out of scope for the app-wide runner |
| Secret redaction helper | **EXISTS (defense-in-depth only)** | `redactSecretsInText` + `isSecretLikePath` (`core/diff-service.ts:62,261`). Deliberately underfit — NOT the sole egress guard (see risks) |
| Server auth + CSRF | **EXISTS** | `/api/*` bearer-token when configured; non-loopback bind without a token refuses to start; origin + `Sec-Fetch-Site` guards on mutations (`server.ts:210-270`) |
| In-process dispatcher: intent → service fn → redacted text | **PROPOSED** | new |
| `POST /api/cli/run` taking a typed **intent** (not argv, not a shell string) | **PROPOSED** | new |
| Key-level secret guard on `config.get` | **PROPOSED** | new — refuse secret-like config keys at the service layer |
| Runnable-hint marking + Run button + output pane | **PROPOSED** | new |

**No FOUNDATION.** No subprocess, no durable state, no nested execution. The
only real work is a small dispatcher + reusing/extracting each command's text
formatter. The runner renders data the dashboard already exposes on loopback —
so it adds no new risk class, only a new view of existing data.

## The risks that decide success

- **Do not reintroduce a spawn.** The whole safety argument rests on this being
  an in-process typed query, not `node dist/index.js <argv>`. Spawning the CLI
  brings back option-injection, arg-smuggling, subprocess fan-out, env
  inheritance, and text-only redaction — all of which vanish in-process.
- **Secret leak via `config.get` (the sharpest real one).** The CLI's `config
  get` prints a **bare value with no key** (`cli/commands/config/get.ts:36-40`),
  so the assignment-shaped redactor can't fire, and a raw secret stored in
  config (nothing forces `env:` refs) would leak. Mitigation: guard at the
  **service layer** — the dispatcher refuses secret-like config keys and returns
  `env:NAME` refs unresolved; `redactSecretsInText` runs on the final text only
  as a second net, never the first.
- **Localhost is a shared trust zone.** On the default loopback bind the route
  is unauthenticated, and the CSRF guards allow same-site / no-origin callers
  (`server.ts:208,237`) — so another local web app or a plain `curl` can call
  it. This is acceptable **only because** the runner exposes exactly the same
  read-only data the existing `/api/config`, `/api/ledger`, `/api/flows` routes
  already serve unauthenticated on loopback. It must never grow past that: no
  write intents, no subprocess-spawning intents, ever. A default-on kill-switch
  (`policies.allowCliRunner`) lets a cautious operator disable it.
- **`doctor` is not read-only.** It calls `applyDoctorFixes` (a write path,
  `cli/commands/doctor.ts:56`) and fan-spawns provider `--version` probes
  (`setup/doctor-service.ts:61`). Excluded from the allowlist.
- **The Action Broker is not a control here.** `command.run` is not in the
  fail-closed `POLICY_UNAVAILABLE_KINDS` set and the default broker denies
  nothing (`action-broker.ts:66-71,164`). So this design does **not** claim
  broker gating as a security control — it emits one structured `cli.run` event
  per invocation for audit, and the control is the typed allowlist itself.
- **Termination.** Each intent is a bounded in-process call that returns and
  ends. No loop, no budget to blow.

## The design

### In-process dispatcher (the core)

A single registry is the one source of truth:

```
CLI_RUNNABLE: Record<IntentKind, {
  params: ZodSchema           // typed, e.g. { runId } validated by SAFE_RUN_ID
  run: (projectRoot, params) => Promise<string>   // calls the in-process
                                                  // service, returns REDACTED text
}>
```

Each `run` calls the same service function the CLI command uses and produces the
command's text output via a shared formatter (reuse the command's compute/format
split where it exists; extract a small formatter where the command inlines
`console.log`). Redaction happens inside `run` at the data layer (e.g.
`config.get` refuses secret keys); `redactSecretsInText` wraps the result as
defense-in-depth. The registry — not argv parsing — is the allowlist.

`IntentKind` v1: `status` · `runs.list` · `ledger` · `assurance` · `audit` ·
`path` · `flows.list` · `flows.show` · `crew.list` · `crew.show` ·
`params.list` · `params.get` · `policies.list` · `config.get` (guarded) ·
`config.keys` · `learn.show`. Excluded: `doctor` (writes + fan-spawns) and every
write/exec command.

### Server: `POST /api/cli/run`

Body (Zod `.strict()`): `{ kind: IntentKind, params?: object }`. The handler
looks up `CLI_RUNNABLE[kind]` (unknown kind → 400), validates `params` against
that entry's schema (invalid → 400), calls `run`, and returns `{ ok, output,
truncated, durationMs }`. Output is byte-capped (256 KB). No `argv`, no shell
string, no executable ever crosses the boundary. Inherits the server's auth +
CSRF guards; read-only, so it never mutates.

### UI: Run affordance in `CliHintOverlay`

Each command row keeps Copy. A **Run** button appears only when the hint maps to
a registry `IntentKind` and has no `<placeholder>` tokens. Clicking Run → POST
the intent → a small output pane opens under that row (mono, scrollable, redacted
text). Full state model per the empty-state doctrine: idle → running (spinner) →
ready (output) → error (message + Retry). Non-runnable rows are unchanged (Copy
only). `cli-hints.ts` gains, per runnable command, an `intent: { kind, params }`
derived from the route; the client uses it only to show Run and to POST — the
server registry is authoritative.

### Works on native Windows

No node-pty, no subprocess — so unlike the shell terminal, the runner works on
native Windows with nothing extra.

## Build sequencing

- **M0 (scout).** Pick the two commands whose compute/format split is *least*
  clean (likely `config get` — inlined `console.log` — and `audit`) and confirm
  their service functions can be called in-process to produce the CLI's text
  without a TTY, and that `config.get`'s secret-key guard actually suppresses a
  planted secret value. This is the assumption the cost rests on: "reuse the
  in-process service" is only cheap if the compute is already separable.
- **M1.** Dispatcher registry + `config.get` service-layer secret guard +
  `POST /api/cli/run`. Route/unit tests: unknown kind → 400, bad params → 400,
  a planted secret in a config value is refused/redacted, output cap, one
  `cli.run` event emitted.
- **M2.** Fill the registry for the remaining v1 intents, reusing/extracting
  each command's formatter. Test: every registry entry returns text and rejects
  malformed params.
- **M3.** `intent` field in `cli-hints.ts` (shared kinds) + Run button + output
  pane in `CliHintOverlay`, full state model. Preview click-through both themes;
  verify a real intent runs and a tampered/unknown kind is refused.
- **M4.** Docs (concepts + this doc), CHANGELOG, version bump.

## Open decisions

- **Text vs structured output.** v1 reproduces the CLI's text (matches the
  terminal, honors intent). If extracting a formatter for some command is
  heavier than expected, that command can render structured JSON in the pane
  instead — decide per command at M2, don't block the batch.
- **Kill-switch policy.** `policies.allowCliRunner` default-on vs no policy
  (read-only in-process is arguably safe enough that a gate is ceremony). Lean:
  ship the policy default-on for an operator off-switch.
- **`path` intent and `/` in a runId.** Validate `runId` with the existing
  `SAFE_RUN_ID` shape (no path separators) rather than a permissive value regex.

## Review trail

Adversarial review (Opus 4.8, fresh context, brief: break it, verify against
code, cite file:line). Verdict: **should-be-reshaped.** Findings, quoted and
adjudicated:

- **FATAL — "Spawning the CLI binary is redundant with existing in-process
  routes and breaks the documented decoupling invariant"** (`detached-run.ts:8-13`
  "never the `vibe` CLI binary"; `getConfigValue` etc. already return structured
  data). **ACCEPTED.** Reshaped the whole design from CLI-spawn to in-process
  dispatch. This dissolved the option-injection, env-inheritance, tree-kill, and
  argv-regex findings (no spawn = none of those exist).
- **HIGH — "redactor is underfit and `config get` prints a bare value the
  assignment-redactor cannot fire on"** (`cli/commands/config/get.ts:36-40`;
  `diff-service.ts:197`). **ACCEPTED.** Added a **service-layer** secret-key
  guard on `config.get`; text redaction demoted to defense-in-depth, not the
  sole guard.
- **HIGH — "unauthenticated local spawn reachable by any localhost-origin page /
  curl"** (`server.ts:208,218,237`). **ACCEPTED as a bound, not a blocker.** The
  reshape makes the route a read-only query over data the existing loopback
  routes already expose, so it adds no new risk class. Encoded as a hard
  invariant (never a write/subprocess intent) + a default-on kill-switch.
- **MEDIUM — "`doctor` is not read-only (applyDoctorFixes) and fan-spawns
  provider probes"** (`doctor.ts:56`, `doctor-service.ts:61`). **ACCEPTED.**
  Dropped `doctor` from the allowlist.
- **MEDIUM — "broker gate is theater by default"** (`action-broker.ts:66-71,164`).
  **ACCEPTED.** Removed the broker-as-control claim; the control is the typed
  allowlist; a `cli.run` event provides the audit trail.
- **LOW — "runArgvCommand is genuinely shell-free but the doc overstates the
  filtered-env story"** (`command-runner.ts:15-23` passes the rest of
  `process.env`). **ACCEPTED, now moot** — no subprocess in the revised design.
- **LOW — "safe-value regex allows `/` and `:`"** (`path.ts:25-30`).
  **ACCEPTED, now moot** — params are typed per-intent; `runId` uses the
  existing `SAFE_RUN_ID` shape.

Reviewer's bottom line, kept verbatim as the design's north star: *"this feature
wants to run four or five inspection queries inline. The server can already
answer all of them in-process. Spawning the product's own CLI over HTTP to
answer them is the most dangerous way to build the least novel feature."*
