# Context scaling (inter-step context management)

Status: **Assessed + measured 2026-06-15 - decision: no knowledge graph; one
small fix justified.** No graphify-style graph and no new context subsystem. The
orchestrator-correct layer already exists (`FlowContextPacket`) and cuts 59% of
source tokens at current scale. Measurement (see below) found no scaling
bottleneck yet and one cheap inefficiency worth fixing (summary overhead). This
doc is the answer to the backlog item "Graphy (AI context-graph) integration?".

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

## Recommendation

- **Measured (done).** No scaling bottleneck at current scale; the layer cuts
  59%. The one justified build today is **fixing summary overhead** (item 1's
  sibling): in `summarizeContent`, when the wrapped/summarized form isn't smaller
  than the source, embed full instead of paying the wrapper. Safe (tokens only
  go down or stay equal, content is more faithful), small, and measured.
- **Don't build the rest speculatively.** Items 2-4 (codex token fidelity, loop
  compaction, whole-run budget) wait for a *measured* signal at scale. Re-run
  `scripts/context-scan.mjs` on a large-codebase run first; confirm whether
  `reference-only`/`omitted` start firing.
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
