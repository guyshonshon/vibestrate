# Design: Provider structured output (live streaming + real token/cost control)

Status: **design — endorsed direction, not yet built** · Owner: maintainer

Make a provider's output **structured** (JSON / streaming-JSON) rather than
plain text, so vibestrate can (a) stream live execution token-by-token, (b) read
**real** token/cost/tool-call metrics, and (c) keep doing all of that for *any*
provider the user configures — not just Claude. Crucially, this must **not**
weaken vibestrate's supervisor control. This doc is the plan + the guarantees.

---

## Why

Today every provider runs **one-shot + headless** (`claude -p "<prompt>"`,
`codex exec`, …) and vibestrate captures the buffered stdout. Two costs:

1. **No live execution.** A CLI in print mode buffers its whole answer to a
   pipe (it only streams to a TTY), so the live panel is empty until the agent
   exits, then dumps. Not "live."
2. **No real token/cost.** Plain text carries no usage. So the token/cost
   *control* vibestrate advertises (budgets, per-step spend, "watch the cost") is
   not actually delivered — the numbers are blank or guessed.

Structured output fixes both: a JSON/stream-JSON event stream carries the text
*and* `usage` (input/output/cache tokens, cost, tool-call counts) *and* arrives
incrementally. **More data, native, live.** This is strictly more supervisor
signal than a plain log — it's the format a supervisor should have wanted all
along.

## How vibestrate's control works (the load-bearing fact)

Vibestrate supervises by **regex-parsing the model's response *text*** for control
markers (`src/core/approval-types.ts`, `src/core/review-parser.ts`):

- `HUMAN_APPROVAL: REQUIRED` (+ `_REASON` / `_RISK` / `_REQUEST`) → pause + a
  human approval gate.
- `DECISION: APPROVED | CHANGES_REQUESTED | BLOCKED` → review outcome.
- `VERIFICATION: PASSED | FAILED | NEEDS_HUMAN` → verify outcome.

So **the control layer rides on the model's response text** — independent of
the output *format*. Enforcement (permission profile, worktree cwd, allowed
tools, between-turn gating) is set by the invocation, not the output shape.

### What structured output changes — and what it must not

- **Unchanged:** still one-shot + headless; same `--permission-mode`,
  `--allowed-tools`, worktree; the CLI still exits when done. A structured
  output format is **reporting**, not an interactive session — the model's
  *actions* are identical. Enforcement is byte-for-byte the same.
- **Changes:** stdout is now JSON events. Vibestrate must **extract the assistant's
  response text** from the stream to feed the control parsers; the markers live
  in that text.

## Non-negotiable guarantees

These are the invariants any implementation must hold (they're what make this
safe):

1. **Lossless response text.** The text vibestrate's control parsers see under a
   structured format MUST equal what plain-text mode would have produced. A
   gated test asserts `parse(textMode) === parse(structuredMode)`, including a
   `HUMAN_APPROVAL` marker round-trip.
2. **No silent fallback — fail loud.** If a stream is malformed or no terminal
   result is found, the agent **turn fails** and the run pauses. Vibestrate must
   **never** feed raw/garbled JSON to the control regexes, because a missed
   `HUMAN_APPROVAL` = an executor running past a gate the human should have
   seen. (This is the red flag: a "fall back to raw stdout" is exactly that
   breach.)
3. **Enforcement is unchanged.** Permission mode, worktree, allowed-tools, and
   between-turn gating do not depend on output format.
4. **Live text is display-only.** Streamed deltas feed the live panel; they are
   never the control path. Control runs on the extracted, completed response.

### Does the user still answer approvals via vibestrate? Yes.

The approval gate fires on the `HUMAN_APPROVAL` marker in the model's response
text, which we extract from the stream. The human answers it in vibestrate's UI/CLI
exactly as today. Structured output does **not** introduce a provider-side
interactive prompt (in headless mode the CLI never prompts; it auto-handles
tools per the permission mode). The only approvals are vibestrate's, **between
turns**.

> Nuance: vibestrate's gates are between-turn, not mid-turn. Streaming lets you
> *watch* a turn live, but you still can't interrupt the CLI mid-tool-call (the
> turn is one-shot). Per-tool live approval is a different, much larger
> architecture (an interactive permission-prompt MCP server) — see Non-goals.

## Architecture: provider output adapters

The generalization that keeps control **uniform** while letting each provider
be as rich as it supports: normalize every provider's output to one contract,
and have vibestrate's control + display + metrics consume only the normalized shape.

```ts
type NormalizedTurn = {
  /** The assistant's final response text — the ONLY thing control parsers
   *  (approval / decision / verification) ever read. */
  responseText: string;
  /** Native metrics when the format carries them; null when text-only. */
  metrics: {
    inputTokens?: number; outputTokens?: number;
    cacheReadTokens?: number; cacheCreationTokens?: number;
    costUsd?: number; toolCallCount?: number; model?: string;
  } | null;
};

interface ProviderOutputAdapter {
  /** Final parse: raw stdout → normalized turn. Throws (→ turn fails loud)
   *  if the structured stream is unrecognizable. */
  finalize(rawStdout: string): NormalizedTurn;
  /** Live: a raw stdout chunk → human-readable text for the live panel
   *  (display only). Returns "" for non-text events. */
  liveText?(rawChunk: string): string;
}
```

- **`text` adapter (default):** `responseText = stdout`, `metrics = null`,
  `liveText = passthrough`. This is exactly today's behavior — every existing
  provider keeps working unchanged.
- **`claude-stream-json` adapter:** parses `--output-format stream-json`
  events → `responseText` from the terminal `result` event, `metrics` from
  `usage`, `liveText` from `content_block_delta`. (The parser + metrics
  extraction already exist in `claude-code-output-parser.ts`; this wires them
  into the adapter contract + adds delta→text for the live panel.)
- **future adapters:** `codex-json`, `gemini-json`, … land incrementally. Until
  a provider has one, it uses `text` (correct, just not live/metered).

Vibestrate's control, live panel, and metrics store consume `NormalizedTurn` only —
so the **supervision contract stays uniform** even as formats diverge. The
divergence is contained inside adapters; nothing supervision-critical is
special-cased per provider.

## User configuration

A provider in `project.yml` opts into a structured format; the adapter is keyed
by it. Default stays `text`, so nothing changes for anyone who doesn't opt in.

```yaml
providers:
  claude:
    type: cli
    command: claude
    output: stream-json        # text (default) | json | stream-json
  codex:
    type: cli
    command: codex
    output: text               # until a codex-json adapter ships
```

`vibestrate doctor` / the Providers page can offer "enable rich output" for
providers whose adapter exists, and explain the tradeoff (richer + live, vs the
plain-text baseline). The setup never silently changes a working provider.

## What this unlocks (the token/cost control we promised)

Once `metrics` is real and per-turn:

- **Live token/cost** in the run view (no more `—`), accumulating per step.
- **Budgets / guards:** stop or pause a run that exceeds a token/cost ceiling —
  a genuine supervisor control, impossible without structured usage.
- **Honest reporting:** per-step + per-run spend in metrics, replay, and the
  final report, sourced from the provider instead of estimated.

## Phased plan

1. **Adapter layer.** Introduce `ProviderOutputAdapter` + the `NormalizedTurn`
   contract; route all providers through it (everyone gets the `text` adapter →
   zero behavior change). Land with parity tests.
2. **Claude stream-json adapter.** First real adapter. Gate it behind the
   `output: stream-json` config + the lossless-parity test (incl. a
   `HUMAN_APPROVAL` round-trip). Wire `liveText` → the live panel and `metrics`
   → the metrics store.
3. **Live UI.** Live panel renders streamed `liveText`; right-rail shows real
   live tokens/cost (already accumulating in the run-detail rework).
4. **Budgets (optional, later).** Token/cost ceilings that pause a run.
5. **More adapters.** `codex-json`, `gemini-json`, etc. as each provider's
   structured mode is verified.

## Test plan

- **Parity (control-safety):** same prompt, `text` vs `stream-json` adapters →
  identical `responseText` and identical approval/decision parse. Include a
  `HUMAN_APPROVAL: REQUIRED` in the response and assert the gate fires under
  both. (Fake provider emitting a realistic stream-json sequence — no real CLI
  in tests.)
- **Fail-loud:** a malformed stream → `finalize` throws → turn fails, run pauses
  → control parsers never run on garbage.
- **Metrics:** `usage` events → tokens/cost populate.
- **Live:** `content_block_delta` events → readable text reaches the panel.
- **Real-CLI smoke (manual, off-CI):** verify the stream-json schema against an
  installed `claude` once — can't be validated in unit tests.

## Pros / cons

**Pros**
- True live execution (token-by-token) and **real** token/cost/tool-call
  metrics — the supervisor signal we were missing.
- Generalizes cleanly via the adapter contract; not a claude special-case.
- Control stays uniform (everything consumes `NormalizedTurn`).
- Unlocks budgets/guards that need real usage data.

**Cons**
- Each rich format needs its own adapter + parser (work amortized over time;
  `text` remains the safe default until then).
- Larger parsing surface feeding supervision → must hold the guarantees
  (lossless + fail-loud) rigorously; enforced by the parity/fail-loud tests.
- Uneven UX until adapters exist (claude streams; others stay text).

## Non-goals (for now)

- **Mid-turn / per-tool human approval.** That needs an interactive
  permission-prompt server and a different invocation model; out of scope. This
  design keeps vibestrate's between-turn gating.
- **Silent fallbacks of any kind.** A structured turn that can't be parsed
  fails loud.
- **Changing what the CLI is allowed to do.** Output format only; permissions,
  worktree, and allowed-tools are untouched.
