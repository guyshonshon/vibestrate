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

## Prior art (researched 2026-06-15)

We are not the first to fight this. Four research sweeps; the convergent findings:

**The multi-agent context debate (Cognition vs Anthropic) reconciles to a domain split.**
- Anthropic's orchestrator-worker research system beat single-agent by **90.2%** -
  but at **~15x the tokens**, and they explicitly exclude "tasks that require all
  agents to share the same context or involve many dependencies" - i.e. coding
  pipelines. ([built-multi-agent-research-system](https://www.anthropic.com/engineering/built-multi-agent-research-system))
- Cognition: writes stay **single-threaded**; extra agents add *intelligence, not
  actions*. Their #1 failure mode: "actions carry implicit decisions, and
  conflicting decisions carry bad results." Fix long horizons with **compaction**
  (distill history into "key details, events, and decisions"), not peer handoffs.
  ([dont-build-multi-agents](https://cognition.ai/blog/dont-build-multi-agents),
  [multi-agents-working](https://cognition.ai/blog/multi-agents-working))
- **Counterintuitive, decision-shaping:** their Code-Review-Loop "works best when
  the coding and review agents do **not** share context beforehand" - a clean-window
  reviewer catches more (Devin Review ~2 bugs/PR, ~58% severe). So re-feeding the
  reviewer everything is *worse*, not just costlier.
- Anthropic "context engineering": the goal is "the smallest set of high-signal
  tokens"; beware **context rot** (recall degrades as the window grows); prefer
  **just-in-time retrieval** (hold paths/refs, load on demand).
  ([effective-context-engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

**Cheapest provider-agnostic lever = a built-once digest in a shared store, injected per agent.**
- Prompt caching (the obvious "make re-sends cheap") is **API-only** - a tool that
  pipes text to a local CLI cannot use it. ([prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching))
  Confirms our rejected "cross-seat cache prefix" rung.
- Blackboard / shared-state (LangGraph, CrewAI, AutoGen) and Cognition's
  compression-handoff all converge on **write-once / read-or-reference-many**, which
  shrinks tokens themselves rather than discounting a re-send. Caveat: Cognition
  calls the compression step "hard to get right" - a lossy digest must carry the
  *decisions*, not just facts.

**Knowledge graph (rung 3): narrowly justified, and a token-efficiency play, not accuracy.**
- For **stable docs/specs**: a flat digest + on-demand read usually suffices; full
  LLM-extracted GraphRAG costs **20-100x** vector indexing. Cheap exception:
  LazyGraphRAG (noun-phrase, no LLM) for genuine *global/synthesis* questions vector
  RAG can't answer even at 1M-token windows.
  ([LazyGraphRAG](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/),
  [BenchmarkQED](https://www.microsoft.com/en-us/research/blog/benchmarkqed-automated-benchmarking-of-rag-systems/))
- For **code**: a local AST graph (graphify-style is **pure tree-sitter, no API** -
  fits our constraints) gave **~10x fewer tokens but lower accuracy** in benchmark
  (graph 0.83 vs grep-agent 0.92). Net-negative on actively-edited code without
  incremental, write-triggered sync. ([Codebase-Memory](https://arxiv.org/html/2603.27277v1),
  ["Is Grep All You Need?"](https://arxiv.org/html/2605.15184v1))
- (aider repo-map = tree-sitter + PageRank-ranked, token-bounded; Cursor = embeddings
  + merkle change-detection. [training-knowledge, not freshly verified - the 4th
  research sweep hit a session limit].)

**The single takeaway:** build **one writer + role-isolated context**, with
compacted decision-carrying handoffs - **not** a shared store everyone reads and
writes. Ground the producers; clean-room the judges. A graph is a later, narrow,
opt-in efficiency tool, never the foundation.

## Plan: per-role context projection (rung 2)

The North Star (the "true context management over each task" you asked about) is a
**context projection layer**: vibestrate owns one structured representation of the
run's knowledge and projects the *minimal, role-appropriate* slice into each agent,
instead of re-feeding everything. Rung 2 is the first real step; it is entirely
Vibestrate-controllable and provider-agnostic (no API caching, no model calls).

Concrete changes, anchored to current code:

- **2a - Emit `reference-only` (mechanical, low risk).** `decideContextInclusion`
  (`flow-context-builder.ts:196`) never returns `reference-only`, though
  `renderPromptContent` already renders it. Add a size threshold: past N bytes a
  bulky artifact becomes a path + 1-2 line descriptor the agent opens on demand
  (just-in-time retrieval). Test: a large artifact yields `reference-only`, a small
  one stays `embedded-full`.
- **2b - Route attached context sources through the budget.** Today
  `this.materializedContext` is injected raw into every seat (`orchestrator.ts:4509`),
  bypassing the packet - so a D-token `.md` corpus costs ~`D*seats`. Feed attached
  sources through the same disposition path so large docs become summary/reference,
  not full-per-seat.
- **2c - Role-differentiated projection (the research-driven one).** Project context
  by seat kind, not uniformly:
  - *Producers* (agent-turn: plan/architect/implement) get **grounding** - the spec
    + a running **decision log** (extend `run-brief.ts` so it carries *decisions/why*,
    not just step outcomes - Cognition's first law).
  - *Judges* (review-turn/verify/summary) get a **clean room** - the artifact under
    review + task, minus upstream chatter. Cuts tokens *and* (per Cognition) improves
    catch rate. **Risk:** must verify on a real run that catch rate holds/improves -
    can't confirm on toy runs.

### Build status (2026-06-15, after an adversarial Opus design review)

- **Slice 1 - summary-overhead fix: SHIPPED** (`7aee72f8`). `decideContextInclusion`
  embeds full when the summary wrapper isn't actually smaller (non-`reused` only).
  Full suite green. This is the corrected, safe core of "2a".
- **2a reference-only: DEFERRED - it was silent data-loss.** The review found the
  rendered reference is run-dir-relative (`.vibestrate/runs/<id>/artifacts/...`) but
  the agent's cwd is the worktree (a *sibling* of project root), so the path can't
  resolve - the agent silently loses the content. The body text ("retained in the
  live participant session") is also only true for `reused` mode. Reviving
  reference-only needs: an **absolute** path the agent's CLI can open, a
  redaction/permission contract (referencing a file re-exposes content the prompt
  redacts), and gating on the actual `contextMode` - not a byte threshold.
- **2b + 2c collapse into ONE opt-in mechanism.** Solving "attached docs full-per-seat"
  *uniformly* (2b) has no free lunch: reference-only bets on JIT retrieval (uncertain),
  summary is lossy, raw-file reference re-exposes redacted secrets. The clean answer is
  role-differentiation: a **clean-room seat policy** (a flow-schema field, default OFF).
  A clean-room seat drops run-level grounding (ledger / runBrief / annotations /
  materialized context sources) and gets only its declared inputs + task - which
  delivers both the clean-room judge (2c) *and* attached-source reduction (2b) in one
  inert-by-default change. **The default-flip** (clean-rooming the built-in review/verify
  seats) is **gated on a real-run catch-rate eval** - never a silent override of
  flow-declared `inputs`. **SHIPPED** as the opt-in `cleanRoom` flag on flow steps
  (default off). **Eval-corrected semantics (see below):** a clean-room seat drops
  the producer's run **narrative** (run brief + planner-only ledger/continuity) and
  KEEPS ground truth (attached context sources, user annotations, declared inputs).
  No built-in flow opts in; the default-flip stays gated.

## Eval: clean-room catch-rate (2026-06-15)

A controlled pilot (`scripts/eval-cleanroom2.mts`): one defective `parseRange`
diff reviewed three ways by real `claude`, scored against four known spec defects
(no malformed-input throw, no reversed-range check, no whitespace trim, NaN not
rejected).

| Variant | Context given | Defects caught |
| --- | --- | --- |
| A full-grounded | spec + run brief + diff | 4/4 + extras |
| B clean-room (first impl) | diff + task only | partial - **missed reversed-range + whitespace** (couldn't see the spec; inferred from the name) |
| C spec-only | spec + diff, no brief | 4/4 + extras |

Two findings, both decisive:
- **A ≈ C** - dropping the producer's run brief cost nothing. Dropping the
  producer's *narrative* is safe.
- **B < C** - dropping the *spec* (ground truth) measurably weakened
  spec-compliance review. So the first `cleanRoom` impl (which dropped attached
  sources) was **too aggressive**. Cognition's "clean-room catches more" means
  *hide the producer's reasoning, not the requirements.*

Resulting change: `cleanRoom` now drops only the run narrative and keeps ground
truth (shipped). And: the big attached-doc re-ingestion is **mostly necessary** -
judges need the spec - so clean-room can't cheaply cut it. That re-confirms the
only lever for a *large* doc corpus is rung 3 (a queryable store agents pull
slices from), still gated on corpus size. Caveat: n=1 pilot; it establishes the
*boundary* (keep the spec), not a catch-rate *improvement* - so the default-flip
stays unjustified.

**Explicitly not building:** prompt-cache engineering (API-only); a core knowledge
graph; LLM-based summarization for the digest (keep deterministic unless it proves
to drop decisions). Rung 3 (graph) stays an opt-in **query skill** (graphify, local,
no API), gated on a real big-task-with-docs measurement, justified only for large
*stable* corpora + global/structural queries.

**Sequencing & gates.** 2a -> 2b -> 2c, each its own slice. Every slice changes
agent prompts (Tier-2), so each needs: an independent Opus design review first, and
a before/after `scripts/context-scan.mjs` run (re-ingestion %, disposition mix) plus,
for 2c, a real run to confirm review quality. Build 2a first (smallest, safest).

## Related

- [`vocabulary.md`](./vocabulary.md), [`flows-unification.md`](./flows-unification.md) -
  the model these artifacts flow through (Flow / Step / Seat; `inputs`/`outputs`).
- **T18** (RAG grounding for supervisor/reviewer judgments, [`../TODO.md`](../TODO.md)) -
  distinct: that grounds *judgments* to cut hallucination; this is about
  *budgeting inter-step context*. They may share a retrieval primitive later.
