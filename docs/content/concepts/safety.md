---
title: Safety — Action Broker & policies
description: The single boundary every real effect crosses, the append-only evidence log, and the policies that deny or hold effects for approval.
section: concepts
slug: concepts/safety
---

**Professional explanation.** Every side-effecting operation a run performs —
spawning a provider, running a validation command, applying or reverting a
patch, writing a config file, opening a terminal, completing a run — crosses a
single Vibestrate-owned boundary, the **Action Broker** (`src/safety/action-broker.ts`).
The broker `decide()`s an `ActionRequest` against an ordered evaluator chain
(first `deny` wins, else first `require_approval`, else `allow`) and `record()`s
the decision plus post-execution evidence as one NDJSON line in
`.vibestrate/runs/<runId>/actions.ndjson`. Decisions are fail-closed: a non-allow
verdict refuses the effect. **Policies** are how you supply evaluators.

**Simple explanation.** Nothing a run *does* to your machine happens without
passing one checkpoint that writes down what it decided and what happened. You
can add rules that block or pause specific actions.

## Two kinds of policy

Policy files live in `.vibestrate/policies/*.yml`. A file may carry two lists:

- **`rules:`** — gate *patch content* at apply time (suggestion / bundle apply):
  match added lines by regex or touched files by glob, and refuse the apply.
- **`actions:`** — gate *broker effect kinds*: match a request and return
  `deny` or `require_approval`.

```yaml
# .vibestrate/policies/safety.yml
actions:
  - id: no-network-installs
    description: Block package installs during validation.
    on: [command.run]
    match: { commandRegex: "npm (i|install)|pip install", commandFlags: "i" }
    effect: deny
    message: Network installs are not allowed in this run.

  - id: hold-merge-for-review
    description: A human signs off before a run is merge_ready.
    on: [run.complete]
    match: { status: merge_ready }
    effect: require_approval
    message: Runs require human approval before completing.

  - id: no-secret-writes
    description: Refuse writes to dotenv-style files.
    on: [file.write, file.patch]
    match: { pathGlob: "**/*.env" }
    effect: deny
    message: Writing secret files is blocked.
```

### Action match fields

| Field | Applies to | Meaning |
| --- | --- | --- |
| `providerId` | `provider.spawn` | exact provider id |
| `commandRegex` (+ `commandFlags`) | `command.run` | regex over the command string |
| `pathGlob` | `file.write`, `file.patch` | glob over the written/touched path(s) |
| `status` | `run.complete` | exact terminal verdict (`merge_ready` / `blocked`) |

An action with no `match` applies to **every** request of the listed `on:`
kinds. Effects default to `deny`. Policies can only *refuse or hold* an effect —
they never permit something the built-in safety checks already refused.

## Why it matters

- **One path.** Because construction goes through `createActionBroker`, the same
  policy set reaches every effect site — there is no surface that quietly skips
  the boundary.
- **Evidence, not vibes.** The `actions.ndjson` log is the audit trail the Run
  Assurance artifact and replay read from. Decisions and outcomes are recorded,
  including refused attempts.
- **Fail-closed.** A denied effect stops; a malformed policy *file* is skipped
  (it can't wedge every run), but a matching `deny` is always honored.

Inspect what's loaded with `vibe policies list` / `vibe policies doctor`, the
`GET /api/policies` endpoint, or the Policies panel in the dashboard.

## Run assurance

When a run reaches a terminal state, Vibestrate derives a single honest verdict
from the evidence above — the broker log plus the run's review and verification
decisions — and writes it to `.vibestrate/runs/<runId>/assurance.json`:

| Verdict | Meaning |
| --- | --- |
| `verified` | Policy passed, review approved, validation and verification all passed. |
| `partially_verified` | Some evidence passed, but checks are missing (see `caps`). |
| `unverified` | The run reached merge_ready with no meaningful evidence. |
| `blocked` | The run did not reach merge_ready. |
| `unsafe` | A policy denied an action, or a rollback failed — don't trust the worktree. |

There is **no confidence score** — a verdict is a level capped by what's missing,
not a guess at truth. Read it with `vibe assurance <runId>`,
`GET /api/runs/:runId/assurance`, or the badge on the run detail page.
