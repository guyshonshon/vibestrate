---
title: Codebase map (vibe learn)
status: implemented
created: 2026-07-10
related: [durable-project-memory.md, context-scaling.md]
---

# Codebase map (`vibe learn`)

## What shipped

`vibe learn` deterministically scans the project - stack and scripts via the
project detector, layout and languages via `git ls-files`, best-effort HTTP
route detection via `git grep`, tooling markers (vitest, eslint, docker,
github-actions, ...) - and writes a machine-owned, regenerable codebase map:
`.vibestrate/CODEBASE.md` (human/prompt-facing) and
`.vibestrate/codebase-map.json` (structured, server/UI-facing). Both are
secret-redacted, written atomically, and size-bounded. `vibe learn show`
prints the current map; `vibe init` runs `vibe learn` best-effort at the end,
so a fresh project has a map from the start. A non-git project degrades
honestly - an explicit note in the map, never an error.

The map grounds the planner (injected once per run through the same
continuity channel as the project ledger digest, withheld from clean-room
judges) and Consult. It refreshes automatically at run terminal outcomes and
marks itself stale in `vibe learn show` when `HEAD` has moved since it was
generated. The dashboard's Codebase page gained a "Map" left-rail mode (stat
tiles + sections, a Refresh action, a stale indicator), backed by
`GET /api/codebase-map` and `POST /api/codebase-map/refresh`.

This doc records the three decisions that shape it - each one follows
directly from the reviewed model in
[`durable-project-memory.md`](./durable-project-memory.md) and
[`context-scaling.md`](./context-scaling.md).

## Decision 1: a machine-owned `.vibestrate/` file, not a fenced block in VIBESTRATE.md

`durable-project-memory.md`'s reviewed model already answered this question
for `.vibestrate/STATE.md` (open question #2 in that doc, resolved by the
Opus review): the derived digest lives in a **separate machine-owned file**,
not a fenced managed block inside `VIBESTRATE.md`. Two of that review's
findings apply unchanged to the codebase map:

- **`writeProjectManual` refuses secret-shaped content and is never
  auto-called.** VIBESTRATE.md's writer is the guarded, human-gated path
  (Consult *proposes*, a human applies). Auto-writing a scan result into that
  file every `vibe learn` run would fail-stuck the moment the repo contains
  anything token-shaped, and it would blur the file's one job: your intent,
  never machine output.
- **The manual is authored, the map is regenerated.** `VIBESTRATE.md` is the
  project's Project Model / Risk Rules / Conventions - text a human wrote and
  owns. The codebase map is a scan: the same repo state always regenerates
  the same map. Mixing an authored file and a regenerable cache in one
  document means either the fence logic has to get it right forever (the
  riskiest write in the STATE.md design), or the human section eventually
  gets clobbered. A separate file has no fence to get wrong.

So `.vibestrate/CODEBASE.md` + `.vibestrate/codebase-map.json` follow the
STATE.md precedent exactly: machine-owned, regenerable, atomic-written,
redacting. Losing either file is harmless (`vibe learn` rebuilds them from the
live repo); losing `VIBESTRATE.md` is not, which is exactly why the two stay
apart.

## Decision 2: planner-only injection, never the judges

`context-scaling.md`'s single takeaway is "one writer, role-isolated
context: ground the producers, clean-room the judges." The codebase map is a
grounding artifact - it tells the planner what stack, layout, and conventions
it's working inside so it doesn't have to guess or re-derive them from
scratch. That is exactly the planner's job (choosing a flow, sizing a plan)
and exactly the wrong thing to hand a judge:

- **Producers (planner) get the map.** It rides the same continuity channel
  the ledger digest already uses - loaded once at run start, injected into
  the planner turn only, size-bounded by the same prompt budget.
- **Judges (review, verify) stay clean-room.** They already drop the run
  brief; feeding them a project summary on top would re-introduce exactly the
  "re-feeding the judge everything is worse, not just costlier" failure mode
  `context-scaling.md` measured. A reviewer or verifier reasons from the live
  diff and the live repo - a working tree it can `grep` and run commands
  against - not a snapshot that could already be stale relative to the branch
  it's reviewing.
- **Executors read the repo natively.** The implementer/fixer seats run
  inside a real worktree via the provider CLI, which already has full,
  current repo access. They don't need - and don't get - the map either; it
  would just be a redundant, potentially-stale restatement of what they can
  already see directly.

Consult gets its own codebase-map section for the same reason producers do:
it's advisory grounding for a human's question, not a verdict on a diff.

## Decision 3: deterministic-only, no LLM distillation

`durable-project-memory.md` deliberately deferred its one LLM-touching step -
"optional, bounded local-provider distillation of Lessons Learned" - behind a
measured need, and shipped the deterministic renderer alone. The codebase map
takes the same posture, for the same two reasons:

- **No model APIs unless explicitly requested** (V0/V1 invariant). A
  distillation pass would mean a model call in the core `vibe learn` path,
  which nothing here asked for.
- **Ship deterministic first; add distillation only if the raw output proves
  too noisy on a real project.** The raw scan (stack, scripts, layout,
  languages, entry points, routes, tooling) is already legible and dense
  without narration. If a future project's map turns out too noisy to be
  useful as-is, the fix is the same one `durable-project-memory.md` reserved
  for Lessons Learned: an optional, gated, local-provider summarization pass -
  clearly fenced, never the source of truth, and built only once a real case
  demonstrates the need.

## Review trail

<!-- filled in by the whole-branch review -->

Whole-branch adversarial review (Opus, 2026-07-10) over 644e43c1..eb82708a.
The write path (atomic temp+rename, redact-before-write of both artifacts,
fail-closed loadCodebaseMap), the clean-room isolation (planner-only
continuity channel, proven by a real fake-provider injection test), the
inherited HTTP auth posture (global origin/CSRF/bearer hooks, strict body
schema), and the deterministic no-model-call invariant all held up. The
review found one Important blocking issue: the refresh endpoint returned the
raw in-memory map from writeCodebaseMap, bypassing the secret redaction
applied to the persisted JSON - a secret-shaped string in a script or route
would render live in the dashboard on Refresh though a reload would hide it.
Fixed at the source: writeCodebaseMap now returns the map re-parsed from the
exact redacted JSON it persisted, so no caller can receive unredacted
content. All other findings (tiny-maxBytes truncation overrun, entry-point
path containment, terminal-outcome refresh cost, dashboard error-state
ergonomics) were triaged as deferred low-severity; the theoretical
JSON-corruption-via-redaction concern was verified safe because the redactor
emits only balanced quotes and the loader is fail-closed to an empty-state
map.
