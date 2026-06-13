# Design: Provider capability detection (real models + efforts)

Status: **shipped (slice 1)** · Origin: user report - the consult model/effort
dropdowns offered stale, curated guesses (codex `gpt-5.1`), so a value the
user's actual CLI rejected failed at call time with exit 1.

## The problem, and the fact that unblocks it

Vibestrate's model/effort options were a **hardcoded curated list** per provider
(`provider-apply.ts` `SPECS`). Those go stale: real codex 0.134 offers
`gpt-5.5 / gpt-5.4 / gpt-5.4-mini / gpt-5.3-codex / gpt-5.2`, while the shipped
SPEC still listed `gpt-5.1` / `gpt-5.1-codex-max`. Selecting one your CLI
doesn't accept failed server-side at run time.

The unblocking fact (verified on the user's machine): **codex exposes its real
catalog** -

```
codex debug models [--bundled]
```

emits JSON: `{"models":[{ "slug", "display_name", "default_reasoning_level",
"supported_reasoning_levels":[{"effort"}], "visibility", "supported_in_api" }]}`.
`--bundled` dumps the catalog shipped with the binary (offline, instant); the
live form refreshes from the network. This is a real, machine-readable source -
not the imagined `codex --efforts`, but better.

Honest scope limit: **only codex ships such a command today.** `claude` and
`gemini` have no list-models command (verified: `--model` is a free-form
string). So detection is per-provider and opt-in by capability; everything
without a probe keeps the curated fallback. Manually-added providers can
declare their own probe later (slice 2).

## Decisions

### D1. Detection refreshes the catalog; it never replaces the apply mechanics

A probe tells us **which models exist and which effort levels each supports** -
not *how* the CLI takes them. The "how" (`--model <id>`,
`-c model_reasoning_effort=<level>`) stays in the built-in `SPECS` and is
verified by hand against each CLI's help. So detection overrides only `models`
and `effort.levels`, keeping the built-in `model` apply + `effort.apply`. A
provider with no built-in apply spec (a custom CLI) cannot be auto-wired for
effort from a probe alone - that needs the user to declare the apply (slice 2).

### D2. Reuse the existing `refreshCatalog` + overlay (no parallel store)

There is already a probe system: `vibe provider refresh` -> `refreshCatalog`
(`provider-probe.ts`) scrapes each provider's `--help` for model/effort knobs
and writes them into `.vibestrate/providers-catalog.yml` (the overlay merged
over the built-in catalog, shown as source "overlay"). The reason codex stayed
stale is that codex's `--help` does **not** enumerate models (`--model` is a
free-form `_default`), so the heuristic found nothing.

So we add the structured `codex debug models` probe as an **authoritative
source inside the same `refreshCatalog`**, writing to the same overlay - not a
parallel cache. Precedence is unchanged: built-in < overlay (the probe writes
the overlay). One probe command, one surface, one merge path. Deleting the
overlay entry reverts to curated - fully reversible.

Key behavior change: a **structured** probe (real JSON catalog) is allowed to
refresh a provider even when the built-in is already wired - because the
built-in list is exactly what goes stale. The heuristic `--help` path keeps its
old caution (gap-fill only, skip built-in unless `--force`). Both still respect
a hand-authored overlay entry unless `--force` (your override wins). The apply
mechanics (`--model`, `-c model_reasoning_effort=`) are taken from the built-in
spec, single-sourced - the probe only refreshes which models exist + their
effort levels.

Consequence (adversarial review): for codex there is no longer a "keep the
shipped curated list" outcome on refresh - the structured probe always writes
the overlay (or fails and keeps the prior state). A user who wants codex frozen
hand-authors the overlay entry (which then sticks, per precedence). Reversible:
delete the overlay entry to fall back to curated.

### D3. Detection is explicit/occasional, never blocking startup

Probing spawns a CLI (and the live form may hit the network). So:

- It runs on explicit `vibe provider refresh [id]`, the dashboard "Refresh
  from providers" button (`POST /api/providers/catalog/refresh`), and the
  setup flow (the existing surfaces - this feature taught them the structured
  probe; it added no new endpoint).
- The dashboard/consult read the **overlay-merged** catalog
  (`resolveCatalog`); the probe writes the overlay, so a refresh is an
  explicit user action, not a per-page spawn.
- Probe order: live `debug models` first (15s timeout), fall back to
  `--bundled` if it fails/times out. The `source` field records which won. A
  total failure leaves the prior catalog intact and surfaces the real stderr
  (redacted via `failureExcerpt`) - never a silent wipe.
- Staleness/`binaryVersion` tracking + an opportunistic auto-refresh is
  **slice 2** (slice 1 is manual/on-setup/on-button).

### D4. Report new/removed models

`refreshCatalog` diffs the detected list vs the prior effective list
(overlay entry, else built-in): `added` / `removed` slugs on the finding. The
CLI prints `+added / -removed` per provider, and the Providers page note
summarizes the deltas. Wiring it into the notification center (a bell badge)
+ an occasional background re-probe is **slice 2**.

### D5. Fail closed on a bad probe

A probe that returns non-JSON, an unexpected shape, or zero usable models
returns `null` (parse failure) - the overlay is **not** overwritten, the
curated/prior catalog stands, and the real reason is surfaced as a
`probe-failed` finding. A poisoned catalog that silently narrowed model choice
app-wide is the failure mode to avoid; better to keep the last-known-good list
and say "refresh failed: <reason>".

## Data / implementation

This feature added **no parallel cache**. It plugs the structured probe into
the existing `refreshCatalog` (`provider-probe.ts`), which writes the existing
`.vibestrate/providers-catalog.yml` overlay merged over the built-in by
`resolveCatalog`. New code is just the parser + detector:

```ts
// src/providers/provider-model-detection.ts
type DetectedModel = { slug: string; label: string; efforts: string[]; defaultEffort: string | null };
type DetectedModelCatalog = {
  models: string[];          // selectable slugs (visibility=="list" && supported_in_api)
  modelsRich: DetectedModel[];
  efforts: string[];         // union of supported efforts across listed models
};
function parseCodexModels(stdout: string): DetectedModelCatalog | null; // pure, fail-closed
function modelProbeFamily(providerId, config): "codex" | null;           // codex by id/command
async function detectProviderModels(input): Promise<ModelDetectResult>;  // live -> --bundled -> throw
```

`refreshCatalog` writes an overlay entry `{ model, models, effort:{levels,
apply} }` where `model`/`effort.apply` come from the built-in spec
(single-sourced) and `models`/`effort.levels` come from the probe.

## Surfaces (all pre-existing - the probe just feeds them)

- CLI: `vibe provider refresh [id]` - now prints per-provider `+added /
  -removed` deltas + the `source` ("codex debug models").
- HTTP: `POST /api/providers/catalog/refresh` (already existed) - returns the
  findings incl. deltas/source. `GET /api/providers/catalog` runs
  `resolveCatalog`, so consult + Providers dropdowns reflect the refresh.
- Dashboard: the Providers page "Refresh from providers" button (already
  existed) - now reports the model deltas; the consult dock benefits for free.

## Security / safety

- Probe spawns are bounded (15s timeout), `reject:false`, `stdin:"ignore"`,
  the binary comes from the provider config (`config.command`), args are a
  fixed literal (`["debug","models"]`) - no shell, no injection.
- No secrets: `codex debug models` returns a public model catalog; we store
  only slugs/efforts/labels in the overlay. A failed probe's reason is
  redacted via `failureExcerpt` before display.
- Reversible: delete (or hand-author) the `.vibestrate/providers-catalog.yml`
  entry to override/revert.
- Fail closed (D5): a bad probe never narrows the catalog silently.

## Slices

1. **(shipped)** `parseCodexModels` + `detectProviderModels` + structured
   probe wired into `refreshCatalog` (overrides stale built-in, respects
   overlay) + delta/source reporting across CLI/HTTP/dashboard. Tests: parser
   against the real codex JSON fixture, detect with a fake runner
   (live/bundled/fail), refreshCatalog override + overlay-respect + fail-closed
   + `resolveCatalog` reflection.
2. staleness-based auto-refresh + notification-center wiring (the "notify on a
   new model" the user asked for) + user-declarable probe (command + JSON path
   mapping) for custom/manual providers + claude/gemini probes if/when they
   expose a list command + flag a live-catalog shrink vs last-known.
