---
title: Profile
description: A saved preset that says how strong and expensive a role runs - a provider, its model, and the effort level.
slug: concepts/profile
---

## In simple words

A **Profile** decides how strong and expensive a [[role]] runs. It is a saved preset bundling three things: where the work happens, which model, and how hard that model thinks.

Think of the drive modes on a car. Eco and Sport do not change who is driving, they change how hard the engine works. A profile is that setting for an AI worker, saved under a name so you can reuse it.

Profiles live on their own page in the sidebar:

![The claude-balanced profile card, filed under a claude heading. It is marked used by 6 roles. Three tiles read claude provider, default model, medium effort. Below them are Provider, Label, Model, Max tokens and Timeout fields, and an Effort scale from Faster to Smarter offering low, medium, high, xhigh and max, with medium selected.](/media/docs/scoped/profile-card.png)

The tiles say what it resolves to today, the fields under them are where you change it, and **used by 6 roles** is the count of workers pointing at it. Edit this one card and all six run on the new setting from the next run.

<div class="docs-callout tip">

**Tip.** A role points at a profile, never at a model. That indirection is the point: swap the model for six workers by editing one card, and no role ever hard-codes a model of its own.

</div>

## When you would make another

<div class="docs-cards">

**A cheap one and a strong one**
**Duplicate** on a card copies it under a new id. Keep `claude-balanced` and a `claude-cheap`, and point the mechanical roles at the cheap one.

**Cross-vendor review**
Make a profile on a second provider and point only the reviewer at it. Now the diff is read by something that did not write it.

**A slower, deeper planner**
Same provider, effort set to `max`, pointed only at the planner.

**A local one**
A profile on an Ollama provider, for work that must not leave the machine.

</div>

<div class="docs-callout">

**Did you know?** The effort scale is the provider's own, not one Vibestrate invented. `claude` offers low, medium, high, xhigh and max; `codex` offers a different five; the Gemini CLI exposes none at all and its cards say so. A provider whose reasoning is a numeric budget rather than a level gets no effort knob, instead of a fake one.

</div>

## Going deeper

### Where a profile sits

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

A profile is the fourth link, and the one carrying the model and the effort. Two roles can share one, and a single role can run on a stronger profile for one step through a step override.

### The knobs reach the real provider

A profile's settings take effect on both CLI and HTTP providers: a CLI provider gets a real flag, an HTTP-API provider the equivalent request-body field. A profile changes what gets spawned or sent, not just what gets written down.

Each knob appears only where it is wired to something real:

<div class="docs-chips"><span>claude: low/medium/high/xhigh/max</span><span>codex: minimal/low/medium/high/xhigh</span><span>OpenAI HTTP: minimal/low/medium/high</span></div>

<div class="docs-outcomes"><div class="docs-outcome ok"><b>effort honored</b><span>a level the provider supports, applied as a real flag or request field</span></div><div class="docs-outcome warn"><b>effort_ignored</b><span>a level outside the provider's real ones: the run warns rather than dropping it quietly</span></div></div>

### The model must exist at the provider

A profile naming a model its provider does not offer is a run that fails the moment it spawns, so Vibestrate checks the pair on write and keeps checking it, because a model can stop existing without anyone touching the config.

How strict depends on where the list came from:

- **From the provider itself.** Vibestrate probes each provider's own bundled catalog at the start of every run (an offline read, no network) and caches it. The Model field becomes a picker, and saving a model outside it is **refused**, with the available ids named.
- **From the built-in list.** A curated fallback for a provider that cannot be probed. That list goes stale the day a provider ships a model, so a value outside it is **allowed** and reported as unverified rather than wrong. Refusing here would block every new model on release day.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>model exists</b><span>in a list the provider itself produced</span></div><div class="docs-outcome bad"><b>unknown model</b><span>absent from the provider's own list: the write is refused, and an existing one is flagged</span></div><div class="docs-outcome warn"><b>unverified</b><span>only a curated list to check against: allowed, reported as unproven</span></div></div>

A profile that goes stale this way is surfaced, not carried in silence. Its card turns amber and states the fault, the page header counts it and offers to put your cursor in that Model field, and Mission Control raises a banner naming the profile, because the run that would fail has not started yet.

### There is no per-profile spend dial

A profile does not set a budget. An earlier version had a `budget` field that nothing read at runtime, so it was removed, and a leftover `budget:` key in an old `project.yml` is ignored on load.

Spend is controlled where it bites: the per-turn output cap in **Max tokens**, and a project-level daily cap (`config.budget`, the `vibe budget` command) that stops or downgrades runs. The page shows a dial only where it ties to a real effect.

### Fencing off a role's tools

A profile can name provider tools a role may **not** use, with `disallowedTools`. The main use is `["Task"]` on the write seats of a strict flow: it stops a seat's agent spinning up nested sub-agents that would schedule work outside the flow's plan, so what actually ran stays legible.

Neither the page nor `vibe profile set` writes this one, so add it by hand:

```yaml
profiles:
  strict-writer:
    provider: claude
    model: opus
    # no nested sub-agent orchestration
    disallowedTools: ["Task"]
```

<div class="docs-callout warn">

**This is about legibility, not a write guard.** `disallowedTools` keeps the flow the single scheduler; it is not what stops a read-only seat from writing (that is the seat's permission mode). It is also best-effort - it blocks the default sub-agent path, not every possible fan-out. Off by default: with no list, nothing is disallowed.

</div>

### From the CLI

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
| `provider` | string (required) | raw provider id; must exist in `providers` |
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

Each profile in that list carries `usedBy`, `providerConfigured`, and a `modelStatus` / `modelIssue` verdict. The catalog feeds the model and effort options, and its `sources` map says whether each provider's list came from the provider (`detected`, `overlay`) or from the built-in fallback.

## Going deeper

- [[provider]] - where the work runs and which flags it supports.
- [[crew]], [[role]], [[seat]] - who fills a Flow's steps and what they cost.
- [[flow]] - the steps a task moves through.

Next: [[provider]] is the tool a profile actually runs on.
