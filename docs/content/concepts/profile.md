---
title: Profile
description: A reusable preset that says how strong and expensive a Role runs - a Provider plus its model and effort.
slug: concepts/profile
---

A **Profile** decides how strong and expensive a Role runs. It is a saved preset that bundles a **Provider** (where the work happens), the **model**, and the **effort** level, so a Role can point at it instead of naming a model itself.

<div class="docs-callout">

**A Role points at a Profile, not a model.** A Role names a Profile by its id, and the Profile holds the actual provider, model, and effort. So you swap the model for every Role on a Profile by editing one place, and a Role never hard-codes a model itself.

</div>

Think of it like the drive modes on a car. "Eco" and "Sport" don't change who is driving. They change how hard the engine works. A Profile is that setting for an AI worker, saved with a name so you can reuse it. Keep a few per provider.

## A quick example

```yaml
profiles:
  codex-fast:
    provider: codex
    label: Codex fast
    model: gpt-5.1
    power: low
  claude-max:
    provider: claude
    label: Claude Opus, max effort
    model: opus
    power: max
```

A Role points at one by its id, like `profile: claude-max`. Two Roles can share the same Profile. The same Role can also run on a stronger Profile for a single Step through a step override, without duplicating the Role.

## What a Profile sets

A Profile picks the **Provider** (where the work runs, and what the rest of the knobs are validated against), the **model** (the provider's model id, like `sonnet` or `opus`), the **effort** level (the `power` field, applied through the provider's own flag or field), an optional per-turn output cap (**`maxTokens`**), and a per-turn wall-clock **timeout** (`timeoutMs`). See the schema table under Advanced below for the exact fields.

These settings really take effect, on both CLI and HTTP providers: a CLI provider gets a real flag when one exists, an HTTP-API provider gets the equivalent request-body field. A Profile changes what is actually spawned or sent, not just what gets written down.

Each knob shows up only where it is wired to a real flag or field. The editors offer just the levels and models a Provider supports and hide the rest. The effort levels are the provider's own:

<div class="docs-chips"><span>claude: low/medium/high/xhigh/max</span><span>codex: minimal/low/medium/high/xhigh</span><span>OpenAI HTTP: minimal/low/medium/high</span></div>

Where reasoning is a numeric budget instead of a level (Gemini's CLI thinking budget, Anthropic's `budget_tokens`), no effort knob appears. Vibestrate never forces one global scale onto every provider.

If a Profile sets an effort the provider won't honor (a level outside its real ones, or a provider with no effort knob, reachable by hand-editing `project.yml` or the overlay), the run **warns** with a `provider.effort_ignored` event instead of quietly sending a value the CLI drops.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>effort honored</b><span>level the provider supports, applied as a real flag or request field</span></div><div class="docs-outcome warn"><b>effort_ignored</b><span>level outside the provider's real ones, or a provider with no effort knob: run warns instead of dropping it quietly</span></div></div>

## The model has to be one the Provider actually has

A Profile naming a model its Provider does not offer is a run that fails the
moment it spawns, so Vibestrate checks the pair when it is written - and keeps
checking it, because a model can stop existing without anyone touching the
config.

How hard it checks depends on where the model list came from:

- **From the Provider itself** - Vibestrate probes each Provider's own bundled
  catalog at the start of every run (an offline read, no network) and caches it.
  A hand-written `providers-catalog.yml` counts too. When the list is this, the
  editor is a picker, and saving a model outside it is **refused** with the
  available ids.
- **From the built-in list** - our curated fallback for a Provider that cannot
  be probed. That list goes stale the day a Provider ships a model, so a value
  outside it is **allowed** and reported as unverified rather than wrong.
  Refusing here would block every new model on release day.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>model exists</b><span>in a list the Provider itself produced</span></div><div class="docs-outcome bad"><b>unknown model</b><span>absent from the Provider's own list: the write is refused, and an existing one is flagged on the Profiles page and the dashboard</span></div><div class="docs-outcome warn"><b>unverified</b><span>only a curated list to check against: allowed, and reported as unproven</span></div></div>

A Profile that goes stale this way is surfaced, not silently carried: the
Profiles page marks it and the dashboard shows a banner naming it, because the
run that would fail has not started yet.

## There is no per-profile spend dial

A Profile does not set a budget. An earlier version had a `budget` (low/medium/high) field on each Profile, but it was never read at runtime and changed nothing, so it was removed. A leftover `budget:` key in an old `project.yml` is silently ignored on load.

Spend is controlled where it actually bites: a per-turn output cap with `maxTokens`, and a real project-level daily cap (`config.budget`, the `vibe budget` command and Budget section) that stops or downgrades runs. The editor shows a dial only where it ties to a genuine effect.

## Fencing off a role's tools

A Profile can also name provider tools a Role may **not** use, with `disallowedTools`. The main use is `["Task"]` on the write seats of a strict Flow: it stops a seat's agent from spinning up its own nested sub-agents that would schedule work **outside** the Flow's plan, so what actually ran stays legible to the supervisor and the run tree.

```yaml
profiles:
  strict-writer:
    provider: claude
    model: opus
    disallowedTools: ["Task"]   # no nested sub-agent orchestration
```

<div class="docs-callout warn">

**This is about legibility, not a write guard.** `disallowedTools` keeps the Flow the single scheduler; it is not what stops a read-only seat from writing (that's the seat's permission mode). It is also best-effort - it blocks the default sub-agent path, not every possible fan-out. Off by default: with no list, nothing is disallowed and a run behaves exactly as before.

</div>

## Advanced

The schema fields:

| field | type | meaning |
| --- | --- | --- |
| `provider` | string (required) | raw Provider id; must exist in `providers` |
| `label` | string? | dashboard label (defaults to the profile id) |
| `model` | string \| null | provider model id (e.g. `sonnet`, `opus`) |
| `power` | string \| null | provider-specific effort level (applied via the provider's flag) |
| `maxTokens` | number \| null | per-turn output cap when supported |
| `timeoutMs` | number \| null | per-turn wall-clock timeout |
| `disallowedTools` | string[] \| null | provider tool names this Role may not use (e.g. `["Task"]`); default none |
| `providerOptions` | record | raw provider-specific escape hatch |

- **CLI:** `vibe profile list|add|set|duplicate|remove`; `vibe run "task" --profile claude-max` (run-wide), `--step-profile implement=claude-max` (one step).
- **Shell:** the `[4] Profiles` page manages presets (e/E cycle effort, m/M model, n new, d duplicate, x delete), and the Crew page shows each role's model and effort.
- **API:** `GET /api/profiles` (includes `usedBy`, `modelEnabled`, and a `modelStatus`/`modelIssue` verdict per profile), `POST /api/profiles`, `POST /api/profiles/:id/duplicate`, `PATCH /api/profiles/:id`, `DELETE /api/profiles/:id`; `GET /api/providers/catalog` feeds the model and effort options, and its `sources` map says whether each Provider's list came from the Provider (`detected`/`overlay`) or from the built-in fallback.

## Going deeper

- [[provider]] - where the work runs and which flags it supports.
- [[crew]], [[role]], [[seat]] - who fills a Flow's steps and what they cost.
- [[flow]] - the steps a task moves through.
