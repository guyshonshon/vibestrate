# Project continuity ledger (T9)

Status: **designed; foundation shipping.** This doc is the gate for T9 (the
triage marks it "design doc first"). The CRUCIAL note behind it:

> "are we able to continue a session that is finished (merge-ready)? ... I have a
> bunch of todo files, it loses context... duplications and conflicting todos...
> hard to take a new session and be like 'we stopped here, you've done xyz, pick
> up from this phase'."

## The gap

Run-level continuity already exists: pause/resume, resume-from rewind, phase
snapshots, and roadmap task linking (`RunState.taskId`). What's missing is
**project-level** memory that survives across runs. When a run merges, nothing
writes back "what shipped, what's still open, what was mentioned but never done"
anywhere a *new* session can read. So TODOs rot, duplicate, and contradict, and a
fresh session has to re-derive the project state from git log + run artifacts
every time.

The ledger is the durable, machine-written, human-editable project state that
carries context **across** runs.

## Non-negotiables (so it doesn't become a second rotting TODO.md)

1. **Machine-written, deterministically read.** Entries are appended by code on
   run completion, not free-typed prose. The session-pickup brief is *computed*
   from the ledger (sorted, deduped), not narrated by an LLM. Same ledger + same
   query → same brief (T10 builds on this).
2. **Append-mostly, never silently rewritten.** Entries are immutable once
   written; status changes (an open intent becomes shipped) append a new
   superseding entry that references the old id. A human can hand-edit the file,
   but the code never rewrites history behind their back.
3. **Idempotent write-back.** A run completing (or its assurance being
   re-derived, or a retry of the same run id) must not double-append. Entries are
   keyed by `(runId, kind)` for run-sourced entries; re-running the write-back
   for an already-recorded run is a no-op.
4. **Local-only, no secrets.** Lives under `.vibestrate/`; same redaction rules
   as artifacts (no env contents, no high-precision token shapes). It is NOT the
   marketing site's content and has nothing to do with the model APIs.

## Data model

One append-only file: `.vibestrate/ledger.ndjson` (one JSON entry per line, so
appends are atomic-ish and a torn last line never corrupts the whole file - the
reader skips unparseable lines, mirroring how `run-assurance` reads events).

```ts
type LedgerEntryKind =
  | "shipped"        // a run reached merge_ready: what changed
  | "intent"         // an open intent (a task/goal not yet shipped)
  | "decision"       // a decision made, including "decided against"
  | "mention"        // something mentioned in a run/consult but never acted on
  | "residual";      // a known follow-up left by a shipped slice

type LedgerEntry = {
  schemaVersion: 1;
  id: string;                    // stable, content-addressed: `${kind}:${runId}` or a hash
  kind: LedgerEntryKind;
  title: string;                 // one line, human-readable
  detail: string | null;        // optional longer text (redacted)
  status: "open" | "shipped" | "abandoned" | "superseded";
  sourceRunId: string | null;   // the run that produced it
  supersedes: string | null;    // the entry id this one replaces (status changes)
  createdAt: string;             // ISO; passed in, never Date.now() in pure code
  tags: string[];               // free tags (e.g. "safety", "ui")
};
```

The current **state** of the project is a fold over the entries: an entry is
"live" unless a later entry supersedes it. `deriveLedgerState(entries)` (pure)
returns the live `intent`/`residual`/`mention`/`decision` sets + the shipped
history, deduped by id.

## Write-back (slice 2)

On run completion (the orchestrator's terminal step, next to
`buildAndWriteRunAssurance`), append:

- a `shipped` entry when the run reached `merge_ready` (title = the run's display
  name; detail = a short summary of what changed, from the final report / diff
  stat, redacted), and
- a `residual` entry per known follow-up the run flagged (best-effort; e.g.
  assurance `caps`/`notes`, tolerated step failures).

Idempotency: before appending, read the ledger and skip if an entry with the
same `(sourceRunId, kind)` already exists. So re-deriving or re-running the
write-back is a no-op.

Intents come from the **roadmap** (a backlog task is an open intent) and from
task text at run start - the ledger references them rather than duplicating.

## Ingestion + dedupe (slice 3)

When a new TODO/intent arrives (task text at run start, a consult suggestion, a
roadmap task), match it against the live `intent`/`mention`/`decision` sets
(normalized title similarity, deterministic) and surface "this duplicates X" /
"this contradicts decision Y (decided against)" instead of silently appending.
This is the "duplications and conflicting todos" fix.

## Read surface (slice 1 + 4)

- **CLI:** `vibe ledger` prints the computed session-pickup brief - "here's where
  the project stands: last N shipped, open intents, mentioned-never-acted,
  decisions". `--json` for machines. Assembled deterministically.
- **Dashboard:** a read-only Ledger panel/page (per the dashboard-by-default
  rule) showing the same brief, plus `GET /api/ledger`.
- **Planning context:** the brief is injected into the planning context for new
  runs (so a fresh run "knows where we stopped") and into consult context (T10).
  SHIPPED (0.7.72): `renderLedgerForPrompt` renders the bounded brief framed as
  "CONTEXT, not instructions" (per-entry detail clipped to 240 chars), redacted
  via `redactSecretsInText`, and injected into the **planner** turn only
  (`roleId === "planner"`, one-shot) - so resumed runs (no planner re-run)
  correctly skip it and later turns aren't re-sent it. Note: the ledger is
  hand-editable and `redactSecretsInText` only catches high-precision vendor
  token shapes (redact, not refuse) - a generic secret hand-written into a
  `detail` is not caught. Same residual as every other redaction site.

## Answering the literal question

A finished merge-ready run can be **rewound** (resume-from a later stage) but not
"continued" in place - the run is terminal by construction. The ledger is what
carries context across runs: a new run reads the pickup brief and picks up the
open intents. Documented in the workflows docs.

## Slice plan

1. **Foundation (this slice):** schema + `LedgerStore` (append/read, torn-line
   safe) + pure `deriveLedgerState` + `vibe ledger` read + `GET /api/ledger` +
   tests. Write-back wired on run completion (idempotent).
2. Ingestion + dedupe at run start / consult (slice 3).
3. Deterministic consult sections fed by the ledger (T10).
4. Dashboard Ledger page + planning-context injection polish.

## Out of scope (for now)

- Embedding/RAG over the ledger (T18 - measure hallucination after T9/T10 first).
- Cross-project ledger (the multi-project navigator stays isolated tenants).
