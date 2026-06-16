---
title: Profile
description: A reusable preset that says how strong and expensive a Role runs - a Provider plus its model and effort.
section: concepts
slug: concepts/profile
---

A **Profile** decides how strong and expensive a Role runs. It is a saved preset that bundles a **Provider** (where the work happens), the **model**, and the **effort** level, so a Role can point at it instead of naming a model itself.

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

A Profile picks the **Provider**, the **model**, the **effort** level (the `power` field), an optional per-turn output cap (`maxTokens`), and a **timeout**.

These settings really take effect, on both CLI and HTTP providers. For a CLI provider they become a real flag when one exists (`claude --effort <level> --model <id>`, codex `--model <id> -c model_reasoning_effort=<level>`). For an HTTP-API provider they go into the request body (OpenAI effort becomes `reasoning_effort: <level>`). So a Profile changes what is actually spawned or sent, not just what gets written down.

Each knob shows up only where it is wired to a real flag or field. The editors offer just the levels and models a Provider supports and hide the rest. The effort levels are the provider's own: claude `low/medium/high/xhigh/max`, codex `minimal/low/medium/high/xhigh`, OpenAI HTTP `minimal/low/medium/high`. Where reasoning is a numeric budget instead of a level (Gemini's CLI thinking budget, Anthropic's `budget_tokens`), no effort knob appears. Vibestrate never forces one global scale onto every provider.

If a Profile sets an effort the provider won't honor (a level outside its real ones, or a provider with no effort knob, reachable by hand-editing `project.yml` or the overlay), the run **warns** with a `provider.effort_ignored` event instead of quietly sending a value the CLI drops.

## There is no per-profile spend dial

A Profile does not set a budget. An earlier version had a `budget` (low/medium/high) field on each Profile, but it was never read at runtime and changed nothing, so it was removed. A leftover `budget:` key in an old `project.yml` is silently ignored on load.

Spend is controlled where it actually bites: a per-turn output cap with `maxTokens`, and a real project-level daily cap (`config.budget`, the `vibe budget` command and Budget section) that stops or downgrades runs. The editor shows a dial only where it ties to a genuine effect.

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
| `providerOptions` | record | raw provider-specific escape hatch |

- **CLI:** `vibe profile list|add|set|duplicate|remove`; `vibe run "task" --profile claude-max` (run-wide), `--step-profile implement=claude-max` (one step).
- **Shell:** the `[4] Profiles` page manages presets (e/E cycle effort, m/M model, n new, d duplicate, x delete), and the Crew page shows each role's model and effort.
- **API:** `GET /api/profiles` (includes `usedBy` and `modelEnabled`), `POST /api/profiles`, `POST /api/profiles/:id/duplicate`, `PATCH /api/profiles/:id`, `DELETE /api/profiles/:id`; `GET /api/providers/catalog` feeds the model and effort options.

## Going deeper

- [[provider]] - where the work runs and which flags it supports.
- [[crew]], [[role]], [[seat]] - who fills a Flow's steps and what they cost.
- [[flow]] - the steps a task moves through.
