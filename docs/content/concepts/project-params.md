---
title: Project parameters
description: Fill your project's answers once, and every run reuses them.
section: concepts
slug: concepts/project-params
---

Project parameters are Vibestrate's durable memory of your project's answers, so it doesn't ask you the same questions on every run. A [Flow](./flow.md) declares the *shape* of what it needs (typed `params:` like name, niche, brand color), the project params hold the *values*, and param resolution fills the gaps from them. You fill your project's data once, and every later run reuses it. The values live in `.vibestrate/project-params.json` (gitignored).

This is model-independent. Vibestrate owns the questions (built from the Flow's param schema) and the form. A provider is only an optional helper that can draft a value you review, never part of the answer loop.

## Fill once, then run

```
# Fill once (the --flow form type-checks each value):
vibe params set --flow scaffold projectName=Acme framework=astro

# Now a run just uses them - no prompts, no flags:
vibe run --flow scaffold

vibe params list
```

In the dashboard, the **Project parameters** panel on the Settings page does the same, and the Composer's parameter form prefills from the stored values.

## How a value is chosen

At run start each declared param resolves in this order:

```
explicit --param / body.params   >   VIBESTRATE_PARAM_<NAME> env
   >   project params   >   flow default   >   prompt (TTY) / fail-fast (CI)
```

- **Explicit** flags win, so a one-off override is easy. An empty `--param x=` means "not provided", so the stored value or default still fills it.
- **`VIBESTRATE_PARAM_<NAME>`** is the clean CI seed: export the value, skip the interactive step, and the run never hangs unattended. `<NAME>` is the param name upper-snake-cased, so `colorTokens` becomes `VIBESTRATE_PARAM_COLOR_TOKENS`.
- A **required** param still unset after all of that prompts on a TTY, or **fails fast** in CI with a message naming exactly what to set.

## Scope: per-flow by default

Param names aren't unique across Flows, so by default a stored value is keyed per Flow (`<flowId>.<param>`). Two Flows that both call something `name` never cross-contaminate. Mark a param `shared: true` to store it under a project-global key (the bare name) that any Flow declaring a `shared` param of that name reuses. That's the "fill `niche` once, every Flow sees it" case.

## Secrets

A `secret: true` param **never** stores the raw secret. You give it an environment variable **name**, and the store keeps an `env:NAME` reference:

```
vibe params set --flow deploy api_key=OPENAI_API_KEY   # stores env:OPENAI_API_KEY
```

A run that needs it **fails fast** if that env var isn't set, rather than starting with a non-functional secret. Bare-key writes without `--flow` are non-secret-only, and a best-effort scan still refuses an obvious pasted vendor key.

## Generate a default (optional)

A param can declare a `generate` hint:

```yaml
params:
  palette:
    type: string
    generate:
      instruction: Generate a cohesive color palette for a {{params.niche}} brand
```

Then the Settings panel shows a **Generate** button (and `vibe params generate --flow <id> palette` on the CLI). It calls a provider once, read-only, with your other known param values interpolated in, and returns a suggestion you review, edit, or accept. It is strictly user-initiated and never auto-applied, so a model can't silently make a brand color your project's truth.

## Methodology (a recognized project-global param)

One project-global key is special: `methodology`. Set it to a known value and the **planner** gets that methodology's concrete planning guidance, so plans follow it:

```
vibe params set methodology=tdd          # or: bdd, incremental
```

- `tdd` - plan test-first (failing test -> pass -> refactor).
- `bdd` - plan as Given-When-Then behaviors, then derive the implementation.
- `incremental` - smallest safe vertical slices, green at every step.

It's injected into the planning turn only (bounded, just the one block). An unrecognized value is ignored with a `methodology.unknown` run event, so it never breaks a run. The advisor never sets it for you. Methodology is yours to choose.

## Editing and removing

Editing a value in the Settings panel or via `vibe params set` **supersedes** the old one, and provenance (`user` or `generated`) is tracked. Remove a value explicitly with `vibe params unset <key>`. Vibestrate never purges your stored params on its own.

## Going deeper

- [Flow](./flow.md) - declares the typed `params:` the project params fill.
- [Profile](./profile.md) - a different thing: how *strong* a Role runs (provider + model + effort), not project data. Set with `vibe profile`.
