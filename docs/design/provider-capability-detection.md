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

### D2. One detected layer (a cache), three layers of precedence

There is already a probe system: `vibe provider refresh` -> `refreshCatalog`
(`provider-probe.ts`) scrapes each provider's `--help` for model/effort knobs
into `.vibestrate/providers-catalog.yml` (the overlay). The reason codex stayed
stale is that its `--help` does **not** enumerate models (`--model` is a
free-form `_default`), so the heuristic found nothing.

The structured `codex debug models` probe is wired into the **same**
`refreshCatalog`, but its results go to a **machine-managed detected cache**
(`.vibestrate/providers-detected.json`), NOT the overlay. Three layers:

```
built-in curated SPECS  <  detected cache (auto)  <  user overlay (hand-authored)
```

- **built-in** - the shipped curated list (the floor; goes stale).
- **detected cache** - written by BOTH `vibe provider refresh` (live probe) and
  the run-start auto-detect ([D3](#d3)) (bundled probe). One source of truth for
  machine-detected models, freely refreshable.
- **user overlay** - genuinely hand-authored entries (or the heuristic `--help`
  gap-fill for unknown providers); always wins.

This is the crucial fix from the first cut (adversarial review): the structured
probe used to write the *overlay*, so once a user ran `refresh`, the overlay
permanently shadowed the run-start cache and models went stale again - the exact
failure this feature prevents. With one detected layer, refresh and auto-detect
never shadow each other; the newest detection always shows. A hand overlay still
wins (and detection keeps the cache fresh underneath, so removing the pin
reveals the latest). The apply mechanics (`--model`,
`-c model_reasoning_effort=`) are single-sourced from the built-in spec; the
probe refreshes only which models exist + their effort levels. Reversible:
delete `providers-detected.json` (or the overlay entry).

### D3. Run-start auto-detection - the "Preparing models" stage {#d3}

Detection is cheap (~200ms, offline) so it runs at the **start of every run**, as
a new startup stage between "Assembling context" and "Starting provider"
(`run-startup.ts`, surfaced in the dashboard StartupPanel + the TUI):

- `autoDetectRunModels` (`provider-model-autodetect.ts`) probes each configured
  probe-capable provider via `codex debug models --bundled` - **offline only**
  (`bundledOnly`), instant, never the network form. It updates the cache **only
  when the model/effort set changed** (no churn) and is **best-effort**: a
  missing binary, parse miss, or slow spawn is swallowed per-provider and never
  blocks or fails the run.
- The orchestrator wraps it in an 8s race + try/catch; on overrun the run
  proceeds and the stage reports "timed out". Per-spawn execa timeout is 4s, so
  background spawns self-terminate (bounded).
- The explicit `vibe provider refresh` stays the way to pull the **live**
  (network-refreshed) catalog; run-start uses bundled for speed, which reflects
  whatever the installed binary ships - i.e. it catches a new model the next run
  after the user updates codex.

Cache writes are atomic (temp + rename) so two runs starting together can't tear
the JSON; `loadDetectedCache` is fail-open on a corrupt/torn read (falls back to
the lower layer).

### D4. Report new/removed models

Detection diffs the new list vs the prior effective list (cache entry, else
built-in): `added` / `removed` slugs. The CLI prints `+added / -removed` per
provider, the Providers page note summarizes the deltas, and the run-start
stage shows a compact `codex: +1` / `codex: up to date`. Live `vibe provider
refresh` uses `debug models` (network) first, falling back to `--bundled`; the
`source` field records which won. A notification-center badge for "new model
appeared" is **slice 2**.

### D5. Fail closed on a bad probe

A probe that returns non-JSON, an unexpected shape, or zero usable models
returns `null` (parse failure) - the cache is **not** overwritten, the
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

Both `refreshCatalog` (explicit, live) and `autoDetectRunModels` (run-start,
bundled) write a detected-cache entry; `mergeDetected` (`provider-detected-
store.ts`) overrides `models` + effort `levels` over the built-in spec, keeping
the built-in's `model`/`effort.apply`. `resolveCatalog` =
`mergeCatalog(userOverlay, mergeDetected(cache, BUILTIN))`.

## Surfaces

- Run start: the "Preparing models" stage (bundled auto-detect) - the primary
  path; no user action needed.
- CLI: `vibe provider refresh [id]` (live) - prints per-provider `+added /
  -removed` deltas + the `source`.
- HTTP: `POST /api/providers/catalog/refresh` (pre-existing). `GET
  /api/providers/catalog` runs `resolveCatalog`, so consult + Providers
  dropdowns reflect both the cache and any overlay.
- Dashboard: the Providers page "Refresh from providers" button (pre-existing)
  - reports the model deltas; the consult dock benefits for free.

## Security / safety

- Probe spawns are bounded (run-start 4s, explicit 15s), `reject:false`,
  `stdin:"ignore"`, the binary comes from the provider config
  (`config.command`), args are a fixed literal (`["debug","models"]`) - no
  shell, no injection. Run-start uses `--bundled` (offline) only.
- Best-effort on the run hot path: detection never blocks or fails a run (8s
  outer race + try/catch; per-provider errors swallowed).
- No secrets: `codex debug models` returns a public model catalog; we store
  only slugs/efforts/labels. A failed probe's reason is redacted via
  `failureExcerpt` before display.
- Atomic cache writes (temp + rename); fail-open reads.
- Reversible: delete `providers-detected.json` (or hand-author the overlay).
- Fail closed (D5): a bad probe never narrows the catalog silently.

## Slices

1. **(shipped)** `parseCodexModels` + `detectProviderModels` + the structured
   probe writing the **detected cache** (one layer, shared by explicit refresh
   and run-start auto-detect; overlay wins on top) + the "Preparing models"
   run-start stage + delta/source reporting across run-start/CLI/HTTP/dashboard.
   Tests: parser vs the real codex JSON fixture; detect (live/bundled/fail);
   refresh-writes-cache + hand-overlay-wins + refresh/auto-detect share-one-layer
   (no shadow) + fail-closed; autodetect write-on-change/no-churn/fail-open +
   merge precedence.
2. notification-center wiring (a bell badge for "new model appeared") +
   user-declarable probe (command + JSON path mapping) for custom/manual
   providers + claude/gemini probes if/when they expose a list command + flag a
   live-catalog shrink vs last-known.
