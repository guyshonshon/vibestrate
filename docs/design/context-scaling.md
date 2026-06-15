# Context scaling (inter-step context management)

Status: **Assessed + measured 2026-06-15. Refined after pushback: a real
cross-agent axis exists.** The inter-step layer (`FlowContextPacket`) is sound
and cuts 59% of flow-artifact tokens. But measurement also showed **57% of prompt
tokens are re-ingestion of content an earlier step already had**, and **attached
context-source docs bypass the budget entirely** (re-fed full to every seat). A
graphify-style code graph is still the wrong first move (staleness in edit loops,
build cost, agent-adoption risk), but a **build-once, reference/query-many shared
context store** (rung 2/3 below) is a legitimate direction for big multi-agent
tasks - gated on a real large-corpus measurement. Answers the "Graphy" backlog item.

## The question

Will Vibestrate hit a context / token bottleneck as Flows get longer and richer,
and would a code knowledge graph (e.g. [graphify](https://github.com/safishamsi/graphify))
or a RAG library help? The instinct that context is the eventual scaling axis is
right. The shape of the fix is the part worth getting right.

## Measured (2026-06-15)

Read-only scan of 20 local runs / 68 context packets (`scripts/context-scan.mjs`,
gitignored local tooling - re-run it to refresh):

- **The layer works.** 77,621 source tokens compacted to 31,988 prompt tokens -
  **59% cut.** This is the strongest evidence against bolting on a knowledge graph.
- **No bottleneck at current scale.** Worst run = 4,615 prompt tokens over 6
  steps; biggest single step ~1,775. Orders of magnitude below any context
  window. Caveat: these are small/toy runs - **re-measure on a real
  large-codebase run before trusting this for scale.**
- **`reference-only` and `omitted` never fired (0% of 166 inputs; 37%
  embedded-full, 63% embedded-summary).** The policy thresholds never shed an
  artifact to a pure reference at this scale - so the "summary + on-demand
  reference" path is defined but unexercised. Confirm it triggers at scale.
- **New finding - summary overhead.** 40% of inputs (67/166) were "summarized"
  into a form *larger* than the source: the `Summary for X:` wrapper + size
  footer out-costs the savings on small artifacts (+761 tokens total). Small in
  absolute terms here, but a clean, safe fix (don't wrap when the wrapped form
  isn't smaller - embed full instead). **This is the one build justified today.**
- **Token measurement is half-real.** 9 runs had measured tokens (claude reports
  `input/output/cache` + cost), 10 were estimate-only (codex). So estimate
  fidelity (below) matters mainly for codex, not claude.

## The cross-agent axis (the part the first pass missed)

The first pass measured *inter-step artifact passing*. The sharper question is
**many distinct agents (seats) each re-ingesting the same reference material** on
a big task. Separating the two:

- **Within one seat's multi-step thread** (e.g. planner across its steps): session
  reuse + prompt caching already handle it. Recent claude runs show **90-94% cache
  hit** (`cacheRead` up to 237k tokens). This is the FlowContextRetentionMode
  `reused` path resuming a session - largely solved for claude.
- **Across distinct seats** (planner vs reviewer vs verifier - separate sessions):
  caching does **not** cross sessions. Evidence it can't be engineered from
  Vibestrate: the prompt's first line is `# Vibestrate Agent: ${roleId}`
  (`prompt-builder.ts:137`), so the prefix diverges per seat at byte one; and
  Vibestrate only pipes prompt *text* to the `claude` CLI, which owns the API's
  `cache_control`. **So "reorder the prompt for cross-seat cache hits" is not a
  viable lever here** (investigated; rejected).
- **Measured re-ingestion: 57% of all prompt tokens** (18,242 / 31,988) are
  re-feeds of content an earlier step already produced, across an avg 2.6 seats/run.
  Caveat: not all of that is *waste* - a later seat legitimately needs the prior
  plan/diff. The reducible part is over-feeding a whole artifact when the seat
  needs a slice.
- **Attached context sources bypass the budget.** Materialized `.md`/URL context
  sources are prepended **in full to every seat's prompt** outside the
  `FlowContextPacket` (`orchestrator.ts:4509`) - not summarized, not
  reference-only, not deduped, not counted in the 59%. With S seats a D-token
  corpus costs ~`D*S`. This is exactly the "pass a bunch of `.md`s, every agent
  re-reads them" cost, and it is **structurally real today**. (Magnitude unmeasured
  - the local runs attached no docs; needs a real run with `--context-source`.)

So the controllable lever is **not** caching tricks; it's a build-once,
reference/query-many shared store (rung 2/3). A queryable index/graph earns its
keep only for *large, stable* corpora (docs/specs - not actively-edited code, which
goes stale mid-run) read by many seats.

## What we already have (and why it's the right shape)

`src/flows/runtime/flow-context-builder.ts` builds a per-step `FlowContextPacket`.
Each prior artifact a Step depends on (`inputs`) gets a *disposition* under the
Flow's `contextPolicy` (`compact` / `balanced` / `artifact-heavy`):

- `embedded-full` - the artifact text goes into the prompt verbatim.
- `embedded-summary` - a compacted form goes in; the **full artifact stays on
  disk and is referenced** ("exact content is available in the artifact above").
- `reference-only` - only a pointer; the agent reads it on demand.
- `omitted-unavailable` - missing/not produced.

It carries a token budget (`sourceEstimatedTokens`, `promptEstimatedTokens`,
`estimatedTokensSaved`). Summarization is local and deterministic - no model
call: `summarizeContent` head-clips text to a char budget, and `summarizeJsonToken`
does **structure-aware** extraction for JSON artifacts (files touched, failed
commands, etc.).

The key architectural point: **codebase navigation is the sub-agent CLI's job.**
claude / codex read files on demand inside their own turn. Vibestrate owns
*inter-step* context - handing the right artifacts between Steps with a summary +
an on-demand reference. That is already RAG-lite, done locally, and is exactly
the orchestrator-appropriate pattern. A code knowledge graph solves the
navigation problem we don't own.

Why graphify specifically is the wrong dependency: it is Python/`uv`
(cross-runtime for a Node CLI), it shells out, and its doc/PDF extraction calls
**external LLM APIs** - all three collide with the V0/V1 safety invariants:
local CLI providers only, no model APIs, no arbitrary shell from the product.

## Where the bottleneck actually shows up (named, tagged)

1. **Head-only truncation** [evidence] - `summarizeContent` does
   `content.slice(0, maxChars)`, so the *tail* (often the conclusion of a long
   review) survives only if the agent follows the retained artifact reference.
   If agents don't reliably re-read references, signal is lost. Cheap fix:
   head+tail clipping, or structure-aware text summary like the JSON path.
2. **Estimated tokens for some providers** [evidence, refined by measurement] -
   budgets use `estimateTokens` (a heuristic). claude-code *does* report real
   tokens (`tokensEstimated=false`); codex does not, so codex runs budget on
   estimates end-to-end with no ground truth. Fix (codex): per-provider
   tokenizer-accurate budgeting, or surface the estimated/measured flag so the
   number isn't trusted blindly.
3. **Review -> fix loop accumulation** [inference] - each loop iteration re-feeds
   findings/diffs. Not yet verified whether the packet de-dupes or compacts
   across iterations; if not, long loops inflate the prompt. Fix: loop-aware
   compaction (latest iteration full, priors summarized).
4. **No whole-run budget** [inference] - per-step packets are bounded, but a long
   Flow (many Steps) has no global ceiling, so prompt cost grows ~linearly with
   step count. Fix: a run-level token budget with back-pressure into the
   per-step dispositions.

## The ladder (cheapest first; where a graph actually wins)

| Rung | What | Solves | Status |
| --- | --- | --- | --- |
| 1. Reliable session-reuse + caching | ensure the 90% within-seat case fires every time | within-thread re-feed | mostly works (claude); codex has no cache |
| ~~1.5 Cross-seat cache via prompt order~~ | ~~stable shared prefix across seats~~ | ~~cross-seat re-feed~~ | **rejected** - roleId leads the prompt + CLI owns `cache_control`; not Vibestrate-controllable |
| 2. Shared context under budget | bring attached context sources + repeated shared inputs into the packet: `reference-only`/dedup past a size threshold, or a build-once digest | cross-seat re-feed of docs (the 4509 gap) | **the justified next slice** |
| 3. Queryable index / knowledge graph | build-once, each seat queries for the slice it needs | *large, stable* corpora read by many seats | conditional; opt-in skill; gated on a big-task measurement |

## Recommendation

- **Summary-overhead fix** (small, safe, measured): in `summarizeContent`, when the
  wrapped form isn't smaller than the source, embed full. Independent of the above.
- **Rung 2 is the real lever** and is Vibestrate-controllable: the biggest
  structural waste is attached context sources re-fed full to every seat outside
  the budget (`orchestrator.ts:4509`). Bringing them under the packet
  (`reference-only` / dedup / build-once digest) is the targeted fix - but it
  changes every agent's prompt, so it needs an independent review and its own
  slice before building.
- **Gate rung 3 on real numbers.** Run one big multi-agent task **with attached
  docs** and re-run `scripts/context-scan.mjs`; if attached-doc re-ingestion
  dominates and `reference-only` still doesn't fire, a queryable index/graph
  (graphify as one opt-in-skill implementation) is justified - over *stable*
  corpora only, never live code mid-edit. Measure agent query-adoption vs grep.
- **Defer codex token fidelity, loop compaction, whole-run budget** (items 2-4)
  until a measured signal at scale.

## Related

- [`vocabulary.md`](./vocabulary.md), [`flows-unification.md`](./flows-unification.md) -
  the model these artifacts flow through (Flow / Step / Seat; `inputs`/`outputs`).
- **T18** (RAG grounding for supervisor/reviewer judgments, [`../TODO.md`](../TODO.md)) -
  distinct: that grounds *judgments* to cut hallucination; this is about
  *budgeting inter-step context*. They may share a retrieval primitive later.
