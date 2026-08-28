---
title: Profile
description: A saved preset that says how strong and expensive a role runs - a provider, its model, and the effort level.
slug: concepts/profile
---

## In simple words

A **Profile** decides how strong and expensive a [[role]] runs. It is a saved preset bundling three things: where the work happens, which model, and how hard that model thinks.

Think of the drive modes on a car: Eco and Sport change how hard the engine works, not who is driving.

**Profiles** in the dashboard sidebar holds them, one card each, grouped under the [[provider]] they run on. The page header counts them and flags any that have gone unusable:

<div class="docs-callout tip">

**Tip.** A role points at a profile, never at a model. That indirection is the point: swap the model for six workers by editing one card.

</div>

![The claude-balanced profile card, filed under a claude heading. It is marked used by 6 roles. Three tiles read claude provider, default model, medium effort. Below them are Provider, Label, Model, Max tokens and Timeout fields, and an Effort scale from Faster to Smarter offering low, medium, high, xhigh and max, with medium selected.](/media/docs/scoped/profile-card.png)

The tiles say what it resolves to today and the fields under them are where you change it. Edit this one card and all six roles run on the new setting from the next run.

<div class="docs-callout">

**Did you know?** The effort scale is the provider's own, not one Vibestrate invented. `claude` offers low, medium, high, xhigh and max; `codex` offers a different five; the Gemini CLI exposes none at all and its cards say so. A provider whose reasoning is a numeric budget rather than a level gets no effort knob, instead of a fake one.

</div>

## When you would make another

**New profile** in the page header opens the create form; **Duplicate** on a card copies an existing one under a new id, and **Delete** warns you first if a role still points at it.

<div class="docs-cards">

**A cheap one and a strong one**
Keep `claude-balanced` and a `claude-cheap`, and point the mechanical roles at the cheap one.

**Cross-vendor review**
Make a profile on a second provider and point only the reviewer at it. Now the diff is read by something that did not write it.

**A slower, deeper planner**
Same provider, effort set to `max`, pointed only at the planner.

**A local one**
A profile on an Ollama provider, for work that must not leave the machine.

</div>

A role card on the **Crew** page can also mint one: **New profile** there creates the profile and assigns it to that role in a single step.

## Where a profile sits

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

Two roles can share one profile, and a single role can run on a stronger profile for one step through a step override.

## The knobs reach the real provider

A profile's settings take effect on both CLI and HTTP providers: a CLI provider gets a real flag, an HTTP-API provider the equivalent request-body field. It changes what gets spawned or sent, not only what gets written down.

Each knob appears only where it is wired to something real:

<div class="docs-chips"><span>claude: low/medium/high/xhigh/max</span><span>codex: minimal/low/medium/high/xhigh</span><span>OpenAI HTTP: minimal/low/medium/high</span></div>

<div class="docs-outcomes"><div class="docs-outcome ok"><b>effort honored</b><span>a level the provider supports, applied as a real flag or request field</span></div><div class="docs-outcome warn"><b>effort_ignored</b><span>a level outside the provider's real ones: the run warns rather than dropping it quietly</span></div></div>

The same rule is why there is no per-profile spend dial. An earlier version had a `budget` field that nothing read at runtime, so it was removed, and a leftover `budget:` key in an old `project.yml` is ignored on load. Spend is controlled where it bites: the per-turn output cap in **Max tokens**, and a project-level daily cap (`vibe budget`) that stops or downgrades runs.

## What a profile carries

Eight fields, five of which default to `null`, meaning whatever the provider
does by default. That is why a fresh project runs with almost nothing set.

| Field | What it is |
|---|---|
| `provider` | The provider entry this profile runs on. The one required field. |
| `label` | What the dashboard shows. Defaults to the profile id. |
| `model` | The provider's own model id. `null` = its default. |
| `power` | The effort level, provider-specific on purpose. `null` = the provider exposes none. |
| `maxTokens` | Cap on output tokens for a turn, where the provider supports one. |
| `timeoutMs` | Wall-clock cap for a turn. Unset means no cap. |
| `disallowedTools` | Provider tool names this profile may not use. |
| `providerOptions` | Raw provider-specific options, for what the fields above do not reach. |

<svg viewBox="0 0 560 226" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A crew holds roles; a role names the profile it runs on; a profile names the provider and carries model, power, maxTokens, timeoutMs and disallowedTools; the provider is the command that actually gets spawned.">
  <g fill="currentColor" fill-opacity="0.04">
    <rect x="272" y="90" width="288" height="124" rx="10"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="22.5" width="112" height="42" rx="8"/>
    <rect x="150.5" y="22.5" width="112" height="42" rx="8"/>
    <rect x="454.5" y="22.5" width="106" height="42" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="300.5" y="22.5" width="116" height="42" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M116 43 L146 43"/>
    <path d="M266 43 L296 43"/>
    <path d="M420 43 L450 43"/>
    <path d="M358 66 L358 84"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="140,39.5 146,43 140,46.5"/>
    <polygon points="290,39.5 296,43 290,46.5"/>
    <polygon points="444,39.5 450,43 444,46.5"/>
    <polygon points="354.5,78 358,84 361.5,78"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="56" y="42">Crew</text>
    <text x="206" y="42">Role</text>
    <text x="358" y="42">Profile</text>
    <text x="507" y="42">Provider</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="56" y="57">roles</text>
    <text x="206" y="57">seats, prompt</text>
    <text x="358" y="57">the join</text>
    <text x="507" y="57">command</text>
    <text x="288" y="110" text-anchor="start" fill-opacity="0.92">provider</text>
    <text x="288" y="128" text-anchor="start" fill-opacity="0.92">model</text>
    <text x="288" y="146" text-anchor="start" fill-opacity="0.92">power</text>
    <text x="288" y="164" text-anchor="start" fill-opacity="0.92">maxTokens</text>
    <text x="288" y="182" text-anchor="start" fill-opacity="0.92">timeoutMs</text>
    <text x="288" y="200" text-anchor="start" fill-opacity="0.92">disallowedTools</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="131" y="16" text-anchor="middle">has</text>
    <text x="281" y="16" text-anchor="middle">runs on</text>
    <text x="435" y="16" text-anchor="middle">names</text>
    <text x="544" y="110" text-anchor="end">-&gt; Provider</text>
    <text x="544" y="128" text-anchor="end">string | null</text>
    <text x="544" y="146" text-anchor="end">string | null</text>
    <text x="544" y="164" text-anchor="end">number | null</text>
    <text x="544" y="182" text-anchor="end">number | null</text>
    <text x="544" y="200" text-anchor="end">string[] | null</text>
    <text x="0" y="110" text-anchor="start">five of the six default to</text>
    <text x="0" y="126" text-anchor="start">null, meaning whatever the</text>
    <text x="0" y="142" text-anchor="start">provider does by default.</text>
    <text x="0" y="166" text-anchor="start">timeoutMs left unset is</text>
    <text x="0" y="182" text-anchor="start">what an unattended run</text>
    <text x="0" y="198" text-anchor="start">has to bound some other way.</text>
  </g>
</svg>

The profile is the join. It is the only place a model, an effort level, a token cap and a timeout are named together.

`timeoutMs` being unset is why an unattended run needs the inactivity watchdog:
with no cap and no watchdog, a provider CLI that wedges holds the run open
forever. See [Safety](/docs/concepts/safety).

Write capability is deliberately absent. It is resolved per turn from the run's
permission mode, never stored here, so the same role is write-capable in one run
and read-only in the next without editing anything. The shape is
`profileConfigSchema` in `src/agents/profile-schema.ts`.

## The model must exist at the provider

A profile naming a model its provider does not offer is a run that fails the moment it spawns, so Vibestrate checks the pair on write and keeps checking it, because a model can stop existing without anyone touching the config.

How strict depends on where the list came from:

- **From the provider itself.** At the start of every run Vibestrate probes the providers that can report their own bundled catalog, which today means `codex debug models --bundled`, and caches what comes back. It is an offline read with no network. For a provider on that list the **Model** field becomes a picker, and saving a model outside it is **refused**, with the available ids named.
- **From the built-in list.** The curated fallback, which is what every other provider gets. That list goes stale the day a provider ships a model, so a value outside it is **allowed** and reported as unverified rather than wrong. Refusing here would block every new model on release day.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>model exists</b><span>in a list the provider itself produced</span></div><div class="docs-outcome bad"><b>unknown model</b><span>absent from the provider's own list: the write is refused, and an existing one is flagged</span></div><div class="docs-outcome warn"><b>unverified</b><span>only a curated list to check against: allowed, reported as unproven</span></div></div>

Such a profile is surfaced, not carried in silence. Its card turns amber and states the fault; the page header counts it and offers **Pick a model for** that profile, which puts your cursor in the Model field. The Dashboard raises an amber banner naming it too, because the run that would fail has not started yet.

## Fencing off a role's tools

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

## From the terminal

`vibe shell` manages the same presets on its `[4] Profiles` page: `e`/`E` cycle effort, `m`/`M` the model, `n` new, `d` duplicate, `x` delete, and `r` re-probes the provider catalog.

The command line is the automation path:

```bash
vibe profile list
vibe profile add claude-max --provider claude --model opus --power max
vibe profile set claude-max --power high
vibe profile duplicate claude-max claude-cheap
vibe profile remove claude-cheap

vibe run "task" --profile claude-max
vibe run "task" --step-profile implement=claude-max
```

`--profile` applies to every seated step in that run; `--step-profile` swaps one step and leaves the rest alone.

Over HTTP the page's own routes are `GET`/`POST /api/profiles`, `POST /api/profiles/:id/duplicate`, `PATCH` and `DELETE /api/profiles/:id`, plus `GET /api/providers/catalog`. Each profile in that list carries `usedBy`, `providerConfigured`, and a `modelStatus` / `modelIssue` verdict. The catalog feeds the model and effort options, and its `sources` map says whether each provider's list came from the provider or from the built-in fallback.

A profile is a block under `profiles:` in `.vibestrate/project.yml`, and a role points at one by its id. [The annotated crew config](/docs/reference/crew-config) lists every field with a comment on what it does.

Next: [[provider]] is the tool a profile actually runs on.
