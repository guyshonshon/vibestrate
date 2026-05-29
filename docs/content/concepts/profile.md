# Profile

## Basically

A Profile is **how strong and expensive** a Role should run.

## Example

```yaml
profiles:
  codex-balanced:
    provider: codex
    label: Codex balanced
    power: balanced
    budget: medium
  opus-deep:
    provider: claude
    label: Claude Opus deep
    model: opus
    power: deep
    budget: high
```

A Role points at one of these by id (`profile: opus-deep`).

## More Detail

A Profile chooses the **Provider**, the **model**, the **power/effort** level,
a token **budget**, and an optional **timeout**. Two Roles can share a Profile,
and the same Role can be run on a stronger Profile for one Step via a step
override — without duplicating the Role.

Power/effort is **provider-specific**. Different providers expose different
reasoning/effort controls and some expose none, so `power` is just the level
that provider understands. The dashboard shows only the levels the selected
Provider supports and hides the field when it has none. Vibestrate never forces
one global low/medium/high scale onto every provider.

## Advanced

Schema (`src/profiles/profile-schema.ts`):

| field | type | meaning |
| --- | --- | --- |
| `provider` | string (required) | raw Provider id; must exist in `providers` |
| `label` | string? | dashboard label (defaults to the profile id) |
| `model` | string \| null | provider model id (e.g. `sonnet`, `opus`) |
| `power` | string \| null | provider-specific effort level |
| `budget` | string \| null | coarse spend appetite (`low`/`medium`/`high`/…) |
| `maxTokens` | number \| null | per-turn output cap when supported |
| `timeoutMs` | number \| null | per-turn wall-clock timeout |
| `providerOptions` | record | raw provider-specific escape hatch |

- CLI: `vibe run "task" --profile opus-deep` (run-wide override),
  `vibe run "task" --flow default --step-profile implement=opus-deep` (one step).
- API: `GET /api/profiles`, `PATCH /api/profiles/:profileId`.

Related: [[provider]], [[crew]], [[role]], [[seat]], [[flow]].
