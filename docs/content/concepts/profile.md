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
    budget: low
  claude-max:
    provider: claude
    label: Claude Opus, max effort
    model: opus
    power: max
    budget: high
```

A Role points at one of these by id (`profile: claude-max`).

## More Detail

A Profile chooses the **Provider**, the **model**, the **effort** level (the
`power` field), a coarse **budget**, and an optional **timeout**. Two Roles can
share a Profile, and the same Role can run on a stronger Profile for one Step via
a step override - without duplicating the Role.

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

`budget` is a coarse spend-appetite field kept in config, but it isn't applied
to a spawn yet - so, following the "only real knobs" rule, it's not shown as an
editor dial in the dashboard (advisory for now; wire it before re-surfacing).

## Advanced

Schema (`src/profiles/profile-schema.ts`):

| field | type | meaning |
| --- | --- | --- |
| `provider` | string (required) | raw Provider id; must exist in `providers` |
| `label` | string? | dashboard label (defaults to the profile id) |
| `model` | string \| null | provider model id (e.g. `sonnet`, `opus`) |
| `power` | string \| null | provider-specific effort level (applied via the provider's flag) |
| `budget` | string \| null | coarse spend appetite - advisory, not shown in the editor |
| `maxTokens` | number \| null | per-turn output cap when supported |
| `timeoutMs` | number \| null | per-turn wall-clock timeout |
| `providerOptions` | record | raw provider-specific escape hatch |

- CLI: `vibe profiles list|add|set|duplicate|remove`;
  `vibe run "task" --profile claude-max` (run-wide), `--step-profile implement=claude-max` (one step).
- Shell: the `[4] Profiles` page (manage presets - e/E cycle effort, m/M model,
  n new, d duplicate, x delete) and the Crew page shows each role's model/effort.
- API: `GET /api/profiles` (includes `usedBy` + `modelEnabled`),
  `POST /api/profiles`, `POST /api/profiles/:id/duplicate`,
  `PATCH /api/profiles/:id`, `DELETE /api/profiles/:id`;
  `GET /api/providers/catalog` feeds the model/effort options.

Related: [[provider]], [[crew]], [[role]], [[seat]], [[flow]].
