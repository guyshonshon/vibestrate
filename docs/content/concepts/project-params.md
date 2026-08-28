---
title: Project parameters
description: Answers a flow needs, given once and reused, so you are not asked the same things every run.
slug: concepts/project-params
---

## In simple words

Some [[flow]]s need a few answers before they can work: a project name, a brand colour, which framework you use. **Project parameters** let you give those answers once.

The dashboard's **Settings** page carries a **Project parameters** panel. Pick the flow, fill its fields, press **Save**, and every later run reuses the values. Underneath, that is a small JSON file:

```json
// .vibestrate/project-params.json
{
  "schemaVersion": 1,
  "values": {
    "scaffold.projectName": {
      "value": "acme-api",
      "setBy": "user",
      "at": "2026-08-12T09:14:02.118Z",
      "secret": false
    },
    "scaffold.framework": {
      "value": "astro",
      "setBy": "user",
      "at": "2026-08-12T09:14:02.118Z",
      "secret": false
    }
  }
}
```

Each entry records who set it and when.

<div class="docs-callout tip">

**Tip.** A `secret: true` parameter stores only the *name* of an environment variable, never the value. Nothing adds `project-params.json` to your `.gitignore` for you, so that distinction is what keeps a committed file safe to commit.

</div>

## When a flow uses them

<div class="docs-cards">

**Scaffolding**
A starter-project flow needs the name and the stack.

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


## The Settings panel

`vibe ui` opens the dashboard on `127.0.0.1:4317`; the panel is on **Settings**,
at `#/settings`.

A **Flow** selector lists only the flows that declare `params:` at all. Under it,
one row per parameter: the name, its type as a tag, a `shared` tag when it is
project-global, an amber `secret` marker when the flow declared it secret -
stored value or not - and the flow's description. An `enum` renders as a picker,
everything else as a text field, and `stored:` under each row shows the current
value and who set it - you, a generator, or a default.

<div class="docs-chips"><span>string</span><span>number</span><span>boolean</span><span>enum</span><span>path</span></div>

**Save** writes the edits, and editing here **supersedes** a stored value rather
than only filling a blank. **All stored values** below it lists every key across
every flow with a bin icon to remove one. Nothing is removed on your behalf.

The composer carries the same fields, under **Inputs** on the **New run** page
and under **Flow parameters** on Mission Control's composer. They are a different
thing: an edit there overrides for that one run and is never stored. The fields
do not start blank - each one opens on the stored answer, falling back to the
flow's own default. A `secret` field is the exception and always starts empty,
because a stored secret is an env reference rather than a value to show.

## How a value is chosen

At run start each declared param resolves top to bottom, stopping at the first source that has a value:

<svg font-family="var(--font-sans)" viewBox="0 0 560 234" width="100%" style="max-width:720px;height:auto" role="img" aria-label="Precedence for a project parameter, highest first: an explicit --param flag, then VIBESTRATE_PARAM_NAME in the environment, then the stored project value, then the Flow's default, and only then a prompt or a fast failure in CI.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="1" y="1" width="306" height="32" rx="8"/>
    <rect fill="var(--bg-200)" x="1" y="51" width="306" height="32" rx="8"/>
    <rect fill="var(--bg-200)" x="1" y="101" width="306" height="32" rx="8"/>
    <rect fill="var(--bg-200)" x="1" y="151" width="306" height="32" rx="8"/>
    <rect fill="var(--bg-200)" x="1" y="201" width="306" height="32" rx="8"/>
    <path d="M154 33v18M154 83v18M154 133v18M154 183v18"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)">
    <text x="17" y="22">--param</text>
    <text x="17" y="72">VIBESTRATE_PARAM_&lt;NAME&gt;</text>
    <text x="17" y="122">the stored project value</text>
    <text x="17" y="172">the Flow's default</text>
    <text x="17" y="222">prompt, or fail fast in CI</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11">
    <text x="326" y="22">one-off override, or the composer</text>
    <text x="326" y="72">the clean CI seed</text>
    <text x="326" y="122">what you filled in once</text>
    <text x="326" y="172">what the Flow itself declares</text>
    <text x="326" y="222">only if it is still unset</text>
  </g>
</svg>

- **Explicit** values win, from `--param` or the composer's input fields. An
  empty `--param x=` means "not provided", so the stored value or default still
  fills it.
- **`VIBESTRATE_PARAM_<NAME>`** is the clean CI seed: export it, skip the
  interactive step, and the run never hangs unattended. The name is the param
  upper-snake-cased, so `colorTokens` becomes `VIBESTRATE_PARAM_COLOR_TOKENS`.
  Two params that would collide on one env var are refused when the flow
  resolves, rather than leaving one silently un-seedable.
- A **required** param still unset after all of that prompts on a TTY, or **fails
  fast** in CI with a message naming exactly what to set.

## Scope: per-flow by default

A stored value is keyed per Flow (`<flowId>.<param>`), so two Flows that both call something `name` never cross-contaminate. Mark a param `shared: true` to store it under a project-global key - the bare name - that any other Flow declaring it shared reuses.

## Secrets

A `secret: true` param **never** stores the raw secret. You give it an environment variable **name**, and the store keeps an `env:NAME` reference. Say a Flow of yours declares one:

```yaml
params:
  apiKey:
    type: string
    secret: true
```

Its Settings field then asks for the variable name, not the key, and its placeholder says so. On the CLI:

```bash
# The store keeps env:OPENAI_API_KEY, not the key
vibe params set --flow my-deploy apiKey=OPENAI_API_KEY
```

A run that needs it **fails fast** if that env var isn't set, rather than starting with a non-functional secret. No built-in Flow declares a secret param, so this only comes up in a Flow you write. Bare-key writes without `--flow` are non-secret-only, and a best-effort scan still refuses an obvious pasted vendor key.

## Generate a default (optional)

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

Its row in the Settings panel then grows a **Generate** button, and `vibe params
generate --flow <id> palette` does the same. It calls a provider once, read-only,
with your other known param values interpolated in, and returns a suggestion you
review, edit, or accept. Strictly user-initiated and never auto-applied, so a
model can't silently make a brand colour your project's truth.

## Methodology (a recognized project-global param)

One project-global key is special. Set `methodology` to a known value and the **planner** gets that methodology's concrete planning guidance:

```bash
# Recognized values: tdd, bdd, incremental
vibe params set methodology=tdd
```

- `tdd` - plan test-first (failing test -> pass -> refactor).
- `bdd` - plan as Given-When-Then behaviors, then derive the implementation.
- `incremental` - smallest safe vertical slices, green at every step.

It reaches the planner and nobody else by default, as one bounded block, once per run; `methodologyRoles` in `project.yml` widens that. An unrecognized value is ignored with a `methodology.unknown` run event, so it never breaks a run. The advisor never sets it for you.

## From a terminal

The automation path, and the only surface for a key no flow declares: the
Settings panel is organised by flow, writes a `shared: true` param under its bare
project-global name like the CLI does, and cannot reach a key that exists in no
flow's `params:` block.

```bash
# The --flow form type-checks values against the schema
vibe params set --flow scaffold projectName=Acme framework=astro

vibe params list           # every stored value, secrets as env refs
vibe params get <key>
vibe params unset <key>    # explicit, never automatic
```

`vibe shell` has no parameters screen. Its Config page is a read-only view of
`project.yml`, which is a different file.

## Related

- [Flow](/docs/concepts/flow) - declares the typed `params:` the project params fill.
- [Profile](/docs/concepts/profile) - a different thing: how *strong* a Role runs (provider + model + effort), not project data. Set with `vibe profile`.
