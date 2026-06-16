---
title: Project profile
description: Durable param memory - fill your project's typed answers once and every run reuses them.
section: concepts
slug: concepts/project-profile
---

# Project profile

## Basically

A **project profile** is Vibestrate's durable memory of your project's answers.
A [Flow](./flow.md) declares the *shape* of what it needs (typed `params:` -
name, niche, brand color); the profile holds the *values*; param resolution
fills the gaps from it. You fill your project's data **once**, and every later
run reuses it instead of asking again. It lives in
`.vibestrate/project-profile.json` (gitignored).

It's **model-independent**: Vibestrate owns the questions (built from the Flow's
param schema) and the form. A provider is only an optional helper that can draft
a value you review - never in the answer loop.

## Example

```
# Fill once (the --flow form type-checks each value):
vibe profile set --flow scaffold projectName=Acme framework=astro

# Now a run just uses them - no prompts, no flags:
vibe run --flow scaffold

vibe profile list
```

In the dashboard, the **Project profile** panel on the Settings page does the
same, and the Composer's parameter form prefills from the profile.

## How a value is chosen

At run start each declared param resolves in this order:

```
explicit --param / body.params   >   VIBESTRATE_PARAM_<NAME> env
   >   project profile   >   flow default   >   prompt (TTY) / fail-fast (CI)
```

- **Explicit** flags win, so a one-off override is easy (and an empty
  `--param x=` means "not provided" - the profile/default still fills it).
- **`VIBESTRATE_PARAM_<NAME>`** is the clean CI seed: export the value, no
  interactive step, the run never hangs unattended. (`<NAME>` is the param name
  upper-snake-cased: `colorTokens` -> `VIBESTRATE_PARAM_COLOR_TOKENS`.)
- A **required** param still unset after all of that prompts on a TTY, or
  **fails fast** in CI with a message naming exactly what to set.

## Scope: per-flow by default

Param names aren't unique across Flows, so a stored value is keyed **per Flow**
(`<flowId>.<param>`) by default - two Flows that both call something `name`
never cross-contaminate. Mark a param `shared: true` to store it under a
**project-global** key (the bare name) reused by any Flow declaring a `shared`
param of that name - the "fill `niche` once, every Flow sees it" case.

## Secrets

A `secret: true` param **never** stores the raw secret. You give it an
environment variable **name**, and the profile stores an `env:NAME` reference:

```
vibe profile set --flow deploy api_key=OPENAI_API_KEY   # stores env:OPENAI_API_KEY
```

A run that needs it **fails fast** if that env var isn't set, rather than
starting with a non-functional secret. (Bare-key writes without `--flow` are
non-secret-only; a best-effort scan still refuses an obvious pasted vendor key.)

## Generate a default (optional)

A param can declare a `generate` hint:

```yaml
params:
  palette:
    type: string
    generate:
      instruction: Generate a cohesive color palette for a {{params.niche}} brand
```

Then the Settings panel shows a **Generate** button (and `vibe profile generate
--flow <id> palette` on the CLI). It calls a provider once, read-only, with your
other known profile values interpolated in, and returns a **suggestion** you
review/edit/accept. It is strictly user-initiated and never auto-applied - a
model can't silently make a brand color your project's truth.

## Editing and removing

Editing a value in the Settings panel or via `vibe profile set` **supersedes**
the old one (provenance - `user` / `generated` - is tracked). Remove a value
explicitly with `vibe profile unset <key>`; Vibestrate never purges your profile
on its own.

## Related

- [Flow](./flow.md) - declares the typed `params:` a profile fills.
- [Profile](./profile.md) - a different thing: how *strong* a Role runs
  (provider + model + effort), not project data.
