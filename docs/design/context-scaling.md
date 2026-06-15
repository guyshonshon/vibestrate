# Context scaling (inter-step context management)

Status: **Assessed 2026-06-15 - decision: do not build, evolve what exists.**
No code knowledge graph (graphify-style) and no new context subsystem now. The
orchestrator-correct layer already exists (`FlowContextPacket`); evolve it when a
*measured* bottleneck appears. This doc is the answer to the backlog item
"Graphy (AI context-graph) integration?".

## The question

Will Vibestrate hit a context / token bottleneck as Flows get longer and richer,
and would a code knowledge graph (e.g. [graphify](https://github.com/safishamsi/graphify))
or a RAG library help? The instinct that context is the eventual scaling axis is
right. The shape of the fix is the part worth getting right.

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
2. **Estimated, not measured tokens** [evidence] - budgets use `estimateTokens`,
   a heuristic; local CLIs don't report real token counts, so the budget can
   drift from the provider's real context window. Fix: per-provider
   tokenizer-accurate budgeting.
3. **Review -> fix loop accumulation** [inference] - each loop iteration re-feeds
   findings/diffs. Not yet verified whether the packet de-dupes or compacts
   across iterations; if not, long loops inflate the prompt. Fix: loop-aware
   compaction (latest iteration full, priors summarized).
4. **No whole-run budget** [inference] - per-step packets are bounded, but a long
   Flow (many Steps) has no global ceiling, so prompt cost grows ~linearly with
   step count. Fix: a run-level token budget with back-pressure into the
   per-step dispositions.

## Recommendation

- **Don't build speculatively.** First instrument: compare `estimatedTokensSaved`
  and `promptEstimatedTokens` against real spend per run to see whether (and
  where) the budget actually strains.
- **When it bites, evolve `FlowContextPacket`** (items 1-4). All local, no new
  dependencies, on-brand.
- **If a sub-agent genuinely chokes on a large codebase**, expose a graph/index
  tool as an **opt-in skill** the agent invokes - never a core dependency, never
  auto-run. Measure it against plain claude/codex navigation before adopting,
  because those are already strong at it.

## Related

- [`vocabulary.md`](./vocabulary.md), [`flows-unification.md`](./flows-unification.md) -
  the model these artifacts flow through (Flow / Step / Seat; `inputs`/`outputs`).
- **T18** (RAG grounding for supervisor/reviewer judgments, [`../TODO.md`](../TODO.md)) -
  distinct: that grounds *judgments* to cut hallucination; this is about
  *budgeting inter-step context*. They may share a retrieval primitive later.
