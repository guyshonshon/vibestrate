# Assist primitive (Phase 3)

Status: implemented. The internal building block behind "enhance" and, later,
overview/suggest. Companion to `roadmap-and-sequencing.md` §1/§8.

## What it is

`runAssist` (`src/assist/assist-runner.ts`) is one **one-shot, read-only,
structured-output** call: build a minimal prompt, spawn a provider once, parse
and Zod-validate the JSON response. It deliberately skips the orchestrator —
no worktree, no run lifecycle, no validation/review/fix stages. The degenerate
"ask the model one question, get typed data back" path.

```ts
const { parsed } = await runAssist({
  projectRoot,
  label: "enhance:checklist",
  instruction: "Break this task into an ordered checklist…",
  schema: z.object({ items: z.array(z.string()) }),
  schemaHint: '{ "items": ["first step", "…"] }',
});
```

## Decisions

- **Reuses the real infrastructure, not a parallel path.** Same `runProvider`,
  same output adapter (`normalized.responseText` + metrics), same provider
  config. The only thing skipped is the multi-stage flow machinery.
- **Profile resolution = the crew's read-only planner.** With no explicit
  `profileId`, the assist resolves the role filling the `planner` seat of the
  (default) crew and uses its profile — planner is read-only and
  planning-shaped, the natural assist seat. Callers can override.
- **Gated through the Action Broker.** The `provider.spawn` is decided and
  recorded like every other effect (the "one boundary" guarantee, S0/S2). A
  policy that denies/`require_approval`s provider spawns blocks the assist,
  fail-closed. Evidence lands in a stable audit bucket, `runs/assist/
  actions.ndjson` — it has no `state.json`, so the runs listing ignores it
  (it isn't a real run).
- **Tolerant parse, bounded reprompt.** `extractJson` pulls the first balanced
  JSON value out of the response (tolerating markdown fences and surrounding
  prose). On a parse/validation miss the assist re-prompts once with the error,
  then fails loud with `AssistError`. No silent garbage.
- **Read-only by construction.** The prompt states it; the planner profile is
  `read_only`; and because there's no worktree or apply path, the assist has
  nothing to write even if the model tried.

## Enhance (first consumer)

`src/assist/enhance.ts` decomposes a card into a checklist.

- `proposeChecklist` — runs the assist and returns cleaned, de-duplicated,
  capped item texts. **Mutates nothing** (dry-run).
- `enhanceChecklist` — propose, then append the items via the roadmap service.

The split keeps the gated "dry-run → explicit accept" shape: the API previews
by default (`apply: false`) and the dashboard shows the proposal with an
"Add all" button; nothing reaches the board until a human accepts. This mirrors
how macro **proposals** already work (and stays distinct from them — proposals
create separate cards, enhance fills one card's checklist).

## Surfaces

- CLI: `vibe tasks enhance <id> [--apply] [--profile <id>] [--json]`
- API: `POST /api/tasks/:id/enhance` → `{ applied, proposal, task?, added? }`
- UI: "Enhance" button in the task-detail checklist panel (preview → Add all).

## Not in scope (later)

Overview/summarize and suggest-next are future assist consumers. Real metrics
for non-Claude providers ride on the provider structured-output work
(`provider-structured-output.md`), not here.
