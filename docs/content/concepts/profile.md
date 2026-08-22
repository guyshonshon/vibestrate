---
title: Profile
description: A reusable preset that says how strong and expensive a Role runs - a Provider plus its model and effort.
slug: concepts/profile
---

A **Profile** decides how strong and expensive a Role runs. It is a saved preset that bundles a **Provider** (where the work happens), the **model**, and the **effort** level, so a Role can point at it instead of naming a model itself.

You keep them on the Profiles page. `vibe ui` opens the dashboard on localhost, and Profiles sits in the sidebar.

![The Profiles page in the dashboard, open from Profiles in the sidebar. The header counts one profile across one provider, with New profile at the top right. Under a claude heading, the claude-balanced card is marked used by 6 roles and shows provider, model and effort as tiles above fields for Provider, Label, Model, Max tokens and Timeout (ms), an Effort scale from Faster to Smarter with medium selected, and Duplicate, Delete and Saved along the bottom.](/media/docs/profiles.png)

Each card is one Profile, filed under the provider it runs on. The tiles say what it resolves to today, the fields under them are where you change it, and the count beside the name is the Crew roles pointing at it. Edit one and every one of those roles runs on the new setting, from the next run.

<div class="docs-callout">

**A Role points at a Profile, not a model.** A Role names a Profile by its id, and the Profile holds the actual provider, model, and effort. So you swap the model for every Role on a Profile by editing one place, and a Role never hard-codes a model itself.

</div>

Think of it like the drive modes on a car. "Eco" and "Sport" don't change who is driving, they change how hard the engine works. A Profile is that setting for an AI worker, saved with a name so you can reuse it.

A Profile sets five things: the `provider`, the `model` id, the effort level (`power`), an optional per-turn output cap (`maxTokens`) and a per-turn `timeoutMs`. **New profile** in the header adds one; **Duplicate** on a card copies it under a new id, the short way to keep a strong Profile and a cheap one.

Effort levels are the provider's own, so the scale offers only the ones that provider has: five for `claude`, five different ones for `codex`, and none for the Gemini CLI, whose cards say the provider exposes no effort control.

## Pointing a Role at one

You point a Role at a Profile on the Crew page: every Role card has a Profile dropdown over the presets you've saved, plus a shortcut to create one on the spot. Two Roles can share a Profile, and one Role can run on a stronger Profile for a single Step through a step override. See [[crew]].

That makes a Profile the fourth link in the chain a run follows from a Flow step to a real model:

<svg viewBox="0 0 560 52" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A Flow step names a Seat, your Crew's Role fills that Seat, the Role names a Profile, and the Profile names a Provider. The Profile is the fourth link, and the one that carries the model and the effort.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="111.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="222.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="472.5" y="0.5" width="87" height="45" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="333.5" y="0.5" width="116" height="45" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M92.5 23 H102.5"/>
    <path d="M203.5 23 H213.5"/>
    <path d="M314.5 23 H324.5"/>
    <path d="M453.5 23 H463.5"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="102.5,19.5 108,23 102.5,26.5"/>
    <polygon points="213.5,19.5 219,23 213.5,26.5"/>
    <polygon points="324.5,19.5 330,23 324.5,26.5"/>
    <polygon points="463.5,19.5 469,23 463.5,26.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="44.5" y="19">Flow step</text>
    <text x="155.5" y="19">Seat</text>
    <text x="266.5" y="19">Role</text>
    <text x="391.5" y="19">Profile</text>
    <text x="516" y="19">Provider</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="44.5" y="35">review</text>
    <text x="155.5" y="35">reviewer</text>
    <text x="266.5" y="35">reviewer</text>
    <text x="391.5" y="35">claude-balanced</text>
    <text x="516" y="35">claude</text>
  </g>
</svg>

## Reaching the real provider

A Profile's knobs take effect on both CLI and HTTP providers: a CLI provider gets a real flag, an HTTP-API provider the equivalent request-body field. A Profile changes what gets spawned or sent, not just what gets written down.

Each knob shows up only where it is wired to a real flag or field, so the editors offer the levels and models a Provider supports and hide the rest:

<div class="docs-chips"><span>claude: low/medium/high/xhigh/max</span><span>codex: minimal/low/medium/high/xhigh</span><span>OpenAI HTTP: minimal/low/medium/high</span></div>

A provider whose reasoning is a numeric budget instead of a level (the Gemini CLI's thinking budget, Anthropic's `budget_tokens`) gets no effort knob at all. Vibestrate never forces one global scale onto every provider, and an effort a provider won't honor stays reachable by hand-editing `project.yml`.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>effort honored</b><span>level the provider supports, applied as a real flag or request field</span></div><div class="docs-outcome warn"><b>effort_ignored</b><span>level outside the provider's real ones, or a provider with no effort knob: run warns instead of dropping it quietly</span></div></div>

## The model has to be one the Provider actually has

A Profile naming a model its Provider does not offer is a run that fails the
moment it spawns, so Vibestrate checks the pair on write and keeps checking it,
because a model can stop existing without anyone touching the config.

The strictness depends on where the model list came from:

- **From the Provider itself** - Vibestrate probes each Provider's own bundled
  catalog at the start of every run (an offline read, no network) and caches it.
  A hand-written `providers-catalog.yml` counts too. When the list is this, the
  Model field is a picker, and saving a model outside it is **refused** with the
  available ids.
- **From the built-in list** - our curated fallback for a Provider that cannot
  be probed. That list goes stale the day a Provider ships a model, so a value
  outside it is **allowed** and reported as unverified rather than wrong.
  Refusing here would block every new model on release day.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>model exists</b><span>in a list the Provider itself produced</span></div><div class="docs-outcome bad"><b>unknown model</b><span>absent from the Provider's own list: the write is refused, and an existing one is flagged on the Profiles page and the dashboard</span></div><div class="docs-outcome warn"><b>unverified</b><span>only a curated list to check against: allowed, and reported as unproven</span></div></div>

A Profile that goes stale this way is surfaced, not carried in silence. Its card
turns amber and states the fault, the page header counts it and offers to put
your cursor in that Model field, and Mission control raises a banner naming the
profile, because the run that would fail has not started yet.

## There is no per-profile spend dial

A Profile does not set a budget. An earlier version had a `budget` (low/medium/high) field on each Profile, but nothing read it at runtime, so it was removed and a leftover `budget:` key in an old `project.yml` is ignored on load.

Spend is controlled where it bites: the per-turn output cap in Max tokens, and a project-level daily cap (`config.budget`, the `vibe budget` command) that stops or downgrades runs. The page shows a dial only where it ties to a real effect.

## Fencing off a role's tools

A Profile can also name provider tools a Role may **not** use, with `disallowedTools`. The main use is `["Task"]` on the write seats of a strict Flow: it stops a seat's agent from spinning up its own nested sub-agents that would schedule work **outside** the Flow's plan, so what actually ran stays legible to the supervisor and the run tree.

Neither the page nor `vibe profile set` writes this one, so add it to `.vibestrate/project.yml` yourself:

```yaml
profiles:
  strict-writer:
    provider: claude
    model: opus
    # no nested sub-agent orchestration
    disallowedTools: ["Task"]
```

<div class="docs-callout warn">

**This is about legibility, not a write guard.** `disallowedTools` keeps the Flow the single scheduler; it is not what stops a read-only seat from writing (that's the seat's permission mode). It is also best-effort - it blocks the default sub-agent path, not every possible fan-out. Off by default: with no list, nothing is disallowed.

</div>

## Advanced: CLI and automation

Every action on the Profiles page has a terminal path, for scripts and headless machines. See [the CLI overview](/docs/cli/overview).

A Profile is a block in `.vibestrate/project.yml`, and the page above edits this:

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

A Role points at one by its id, like `profile: claude-max`.

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

Managing presets, then pointing a run at one:

```bash
vibe profile list
vibe profile add claude-max --provider claude --model opus --power max
vibe profile set claude-max --power high
vibe profile duplicate claude-max claude-cheap
vibe profile remove claude-cheap

vibe run "task" --profile claude-max
vibe run "task" \
  --step-profile implement=claude-max
```

`--profile` applies to every seated step in that run; `--step-profile` swaps one step and leaves the rest alone.

In the terminal shell (`vibe shell`), the `[4] Profiles` page manages the same presets (e/E cycle effort, m/M model, n new, d duplicate, x delete), and the Crew page shows each role's model and effort.

Over HTTP:

```text
GET    /api/profiles
POST   /api/profiles
POST   /api/profiles/:id/duplicate
PATCH  /api/profiles/:id
DELETE /api/profiles/:id
GET    /api/providers/catalog
```

Each profile in that list carries `usedBy`, `providerConfigured`, and a `modelStatus` / `modelIssue` verdict. The catalog feeds the model and effort options, and its `sources` map says whether each Provider's list came from the Provider (`detected`, `overlay`) or from the built-in fallback.

## Going deeper

- [[provider]] - where the work runs and which flags it supports.
- [[crew]], [[role]], [[seat]] - who fills a Flow's steps and what they cost.
- [[flow]] - the steps a task moves through.
