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

**Effort and model actually take effect.** They are applied to the provider's
real CLI flag when it exists - `claude --effort <level> --model <id>`, codex
`--model <id> -c model_reasoning_effort=<level>` - so a Profile changes what is
spawned, not just what's recorded. Each is exposed **only where it is wired to a
real flag** (the capability catalog): the dashboard offers just the levels/models
that Provider supports and hides the field otherwise. Effort levels are the real
ones - claude `low/medium/high/xhigh/max`, codex `minimal/low/medium/high/xhigh`;
Gemini's reasoning is a numeric thinking budget (no CLI flag), so it shows no
effort. Vibestrate never forces one global scale onto every provider.

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
