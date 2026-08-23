---
title: Project parameters
description: Answers a flow needs, given once and reused, so you are not asked the same things every run.
slug: concepts/project-params
---

## In simple words

Some [[flow]]s need a few answers before they can work: a project name, a brand colour, which framework you use. **Project parameters** let you give those answers once.

```json
// .vibestrate/project-params.json
{
  "projectName": "acme-api",
  "framework": "fastify"
}
```

The flow declares what it needs, you fill it in a single time, and every later run reuses the values.

<div class="docs-callout tip">

**Tip.** A `secret: true` parameter stores only the *name* of an environment variable, never the value. Nothing adds `project-params.json` to your `.gitignore` for you, so that distinction is what keeps a committed file safe to commit.

</div>

## When a flow uses them

<div class="docs-cards">

**Scaffolding**
A flow generating a starter project needs the name and the stack.

**House style**
A brand colour or a design token set that never changes between runs.

**Environment names**
Which staging branch, which deploy target.

**Anything you would otherwise retype**
If a flow asks twice, it belongs here.

</div>

<div class="docs-callout">

**Did you know?** Parameters are per-flow by default, so two flows asking for `framework` do not have to mean the same thing by it. That scoping is what stops one flow's answer quietly becoming another flow's assumption.

</div>


## Going deeper

### Fill once, then run

```bash
# Fill once - the --flow form type-checks values
vibe params set --flow scaffold \
  projectName=Acme framework=astro

# Every later run just uses them
vibe run --flow scaffold

vibe params list
```

In the dashboard, the **Project parameters** panel on the Settings page does the same, and the Composer's parameter form prefills from the stored values.

Each declared param has a type, and the form type-checks every value against it:

<div class="docs-chips"><span>string</span><span>number</span><span>boolean</span><span>enum</span><span>path</span></div>

### How a value is chosen

At run start each declared param resolves top to bottom, stopping at the first source that has a value:

<svg viewBox="0 0 560 234" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Precedence for a project parameter, highest first: an explicit --param flag, then VIBESTRATE_PARAM_NAME in the environment, then the stored project value, then the Flow's default, and only then a prompt or a fast failure in CI.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="306" height="32" rx="8"/>
    <rect x="1" y="51" width="306" height="32" rx="8"/>
    <rect x="1" y="101" width="306" height="32" rx="8"/>
    <rect x="1" y="151" width="306" height="32" rx="8"/>
    <rect x="1" y="201" width="306" height="32" rx="8"/>
    <path d="M154 33v18M154 83v18M154 133v18M154 183v18"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="17" y="22">--param</text>
    <text x="17" y="72">VIBESTRATE_PARAM_&lt;NAME&gt;</text>
    <text x="17" y="122">the stored project value</text>
    <text x="17" y="172">the Flow's default</text>
    <text x="17" y="222">prompt, or fail fast in CI</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="326" y="22">one-off override, or body.params</text>
    <text x="326" y="72">the clean CI seed</text>
    <text x="326" y="122">what you filled in once</text>
    <text x="326" y="172">what the Flow itself declares</text>
    <text x="326" y="222">only if it is still unset</text>
  </g>
</svg>

- **Explicit** flags win, so a one-off override is easy. An empty `--param x=` means "not provided", so the stored value or default still fills it.
- **`VIBESTRATE_PARAM_<NAME>`** is the clean CI seed: export the value, skip the interactive step, and the run never hangs unattended. The name part is the param name upper-snake-cased, so `colorTokens` becomes `VIBESTRATE_PARAM_COLOR_TOKENS`.
- A **required** param still unset after all of that prompts on a TTY, or **fails fast** in CI with a message naming exactly what to set.

### Scope: per-flow by default

Param names aren't unique across Flows, so by default a stored value is keyed per Flow (`<flowId>.<param>`). Two Flows that both call something `name` never cross-contaminate. Mark a param `shared: true` to store it under a project-global key - the bare name - that any other Flow declaring it shared reuses. That's the "fill it once, every Flow sees it" case.

### Secrets

A `secret: true` param **never** stores the raw secret. You give it an environment variable **name**, and the store keeps an `env:NAME` reference. Say a Flow of yours declares one:

```yaml
params:
  apiKey:
    type: string
    secret: true
```

You then set it by naming the variable, not by pasting the key:

```bash
# The store keeps env:OPENAI_API_KEY, not the key
vibe params set --flow my-deploy \
  apiKey=OPENAI_API_KEY
```

A run that needs it **fails fast** if that env var isn't set, rather than starting with a non-functional secret. None of the built-in Flows declare a secret param, so this only comes up in a Flow you write. Bare-key writes without `--flow` are non-secret-only, and a best-effort scan still refuses an obvious pasted vendor key.

### Generate a default (optional)

A param can declare a `generate` hint:

```yaml
params:
  palette:
    type: string
    generate:
      instruction: >
        Generate a cohesive color palette
        for a {{params.niche}} brand
```

Then the Settings panel shows a **Generate** button (and `vibe params generate --flow <id> palette` on the CLI). It calls a provider once, read-only, with your other known param values interpolated in, and returns a suggestion you review, edit, or accept. It is strictly user-initiated and never auto-applied, so a model can't silently make a brand color your project's truth.

### Methodology (a recognized project-global param)

One project-global key is special: `methodology`. Set it to a known value and the **planner** gets that methodology's concrete planning guidance, so plans follow it:

```bash
# Recognized values: tdd, bdd, incremental
vibe params set methodology=tdd
```

- `tdd` - plan test-first (failing test -> pass -> refactor).
- `bdd` - plan as Given-When-Then behaviors, then derive the implementation.
- `incremental` - smallest safe vertical slices, green at every step.

By default it reaches the planner and nobody else, as one bounded block, once per run. `methodologyRoles` in `project.yml` widens that to other roles. An unrecognized value is ignored with a `methodology.unknown` run event, so it never breaks a run. The advisor never sets it for you. Methodology is yours to choose.

### Editing and removing

Editing a value in the Settings panel or via `vibe params set` **supersedes** the old one, and the store records where it came from - you, or a generator. Remove a value explicitly with `vibe params unset <key>`. Vibestrate never purges your stored params on its own.

### Going deeper

- [Flow](/docs/concepts/flow) - declares the typed `params:` the project params fill.
- [Profile](/docs/concepts/profile) - a different thing: how *strong* a Role runs (provider + model + effort), not project data. Set with `vibe profile`.
