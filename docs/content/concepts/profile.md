---
title: Profile
description: How strong and expensive a Role runs - a reusable preset of a Provider plus its model and effort.
section: concepts
slug: concepts/profile
---

# Profile

## Basically

A Profile is **how strong and expensive** a Role should run - a reusable preset
of a Provider plus its model and effort. Keep several per provider.

## Example

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

A Role points at one of these by id (`profile: claude-max`).

## More Detail

A Profile chooses the **Provider**, the **model**, the **effort** level (the
`power` field), an optional per-turn output cap (`maxTokens`), and a **timeout**.
Two Roles can share a Profile, and the same Role can run on a stronger Profile
for one Step via a step override - without duplicating the Role.

**Effort and model actually take effect** - on CLI **and** HTTP providers. For a
CLI provider they become a real flag when one exists (`claude --effort <level>
--model <id>`, codex `--model <id> -c model_reasoning_effort=<level>`); for an
HTTP-API provider they go into the **request body** (OpenAI effort ->
`reasoning_effort: <level>`). So a Profile changes what is actually spawned or
sent, not just what's recorded. One declarative apply layer
(`src/providers/provider-apply.ts`) is the single source for both the spawn/body
mutation and the levels the editors show. Each knob is exposed **only where it is
wired to a real flag/field** (the capability catalog): the editors offer just the
levels/models that Provider supports and hide the field otherwise. Effort levels
are the real ones - claude `low/medium/high/xhigh/max`, codex
`minimal/low/medium/high/xhigh`, OpenAI HTTP `minimal/low/medium/high`. Where
reasoning is a numeric budget rather than a level - Gemini's CLI thinking budget,
Anthropic's `budget_tokens` - no effort knob is shown. Vibestrate never forces one
global scale onto every provider.

If a Profile somehow sets an effort the provider won't honor (a level outside its
real ones, or a provider with no effort knob - reachable by hand-editing
`project.yml` or the overlay), the run **warns** (a `provider.effort_ignored`
event) rather than silently sending a value the CLI drops.

There is **no per-profile spend dial**. Earlier versions had a `budget`
(low/medium/high) field on each Profile, but it was never read at runtime - it
changed nothing - so it was removed (a legacy `budget:` key in an old
`project.yml` is silently ignored on load). Spend is controlled where it
actually bites: a per-turn output cap with `maxTokens`, and a real
**project-level daily cap** (`config.budget`, the `vibe budget` command / Budget
section) that stops or downgrades runs. Following the "only real knobs" rule, the
editor shows a dial only where it's wired to a genuine effect.

## Advanced

Schema (`src/profiles/profile-schema.ts`):

| field | type | meaning |
| --- | --- | --- |
| `provider` | string (required) | raw Provider id; must exist in `providers` |
| `label` | string? | dashboard label (defaults to the profile id) |
| `model` | string \| null | provider model id (e.g. `sonnet`, `opus`) |
| `power` | string \| null | provider-specific effort level (applied via the provider's flag) |
| `maxTokens` | number \| null | per-turn output cap when supported |
| `timeoutMs` | number \| null | per-turn wall-clock timeout |
| `providerOptions` | record | raw provider-specific escape hatch |

- CLI: `vibe profile list|add|set|duplicate|remove`;
  `vibe run "task" --profile claude-max` (run-wide), `--step-profile implement=claude-max` (one step).
- Shell: the `[4] Profiles` page (manage presets - e/E cycle effort, m/M model,
  n new, d duplicate, x delete) and the Crew page shows each role's model/effort.
- API: `GET /api/profiles` (includes `usedBy` + `modelEnabled`),
  `POST /api/profiles`, `POST /api/profiles/:id/duplicate`,
  `PATCH /api/profiles/:id`, `DELETE /api/profiles/:id`;
  `GET /api/providers/catalog` feeds the model/effort options.

Related: [[provider]], [[crew]], [[role]], [[seat]], [[flow]].
