---
title: Crew configuration, annotated
description: The crew, profiles and role files vibe init writes, with every field explained where it appears.
slug: reference/crew-config
---

## In simple words

There is no `crew.yml`. A [[crew]] lives inside `.vibestrate/project.yml`, under `crews:`, next to the `profiles:` it points at. This page is exactly what `vibe init` writes, with a comment on every field.

Three blocks, in the order they depend on each other:

<div class="docs-cards">

**`providers`**
The raw local tools - the CLI or API that actually runs a model.

**`profiles`**
A reusable runtime setup: a provider, plus how strong and expensive to run it.

**`crews`**
Your roster of roles. Each role runs on a profile and lists the seats it can fill.

</div>

<div class="docs-callout tip">

**Tip.** Do not hand-edit this to swap a model. `vibe profile add` and the Crew page write the same block with the schema enforced, and a typo in `profile:` is a run that fails on its first turn.

</div>

## The crew, commented

```yaml
# ── Profiles ─────────────────────────────────────────────────────────────
# A profile is "which tool, run how hard". Roles point at profiles by key, so
# moving your reviewer to another model is one line here, not six.
profiles:
  claude-balanced:            # the key roles reference
    provider: claude          # must exist in `providers:`
    label: claude balanced    # optional, for the UI
    model: null               # null = the provider's own default
    power: medium             # effort; PROVIDER-SPECIFIC, null when it has none
    # maxTokens: null         # per-turn cap; null = the provider's default
    # timeoutMs: null         # per-turn wall clock
    # disallowedTools: null   # tool names this profile may not use
    # providerOptions: {}     # anything the provider takes and nothing else does

# ── Crews ────────────────────────────────────────────────────────────────
# Your local team. A run picks one crew - `defaultCrew` unless told otherwise -
# and matches the flow's seats to roles through each role's `seats` list.
crews:
  default:                    # the crew id
    label: Default
    # maxReviewLoops: 3       # per-crew override of workflow.maxReviewLoops.
                              # A "fast" crew loops less, a "thorough" one more,
                              # without touching global config.
    # checklistReviewLenses: [security, correctness]
                              # per-crew override of the per-item review lenses,
                              # so a security crew aims every panel the same way
    roles:
      planner:                # the role id
        label: Planner        # optional display name; call it anything
        seats: [planner]      # WHICH CHAIRS THIS ROLE CAN TAKE. At least one.
                              # The names must match a flow's `seats:` keys.
        profile: claude-balanced   # must exist in `profiles:`
        prompt: .vibestrate/roles/planner.json   # this role's instructions
        permissions: read_only     # a key in `permissions.profiles`
        skills: []                 # skill ids appended to this role's prompt
        # mcpServers: {}           # MCP servers this role may reach

      architect:
        label: Architect
        seats: [architect]
        profile: claude-balanced
        prompt: .vibestrate/roles/architect.json
        permissions: read_only
        skills: []

      executor:
        # One role, three chairs. This is why six workers staff an eight-step
        # flow, and why a longer flow rarely needs a new role.
        label: Backend Implementer
        seats: [implementer, executor, builder]
        profile: claude-balanced
        prompt: .vibestrate/roles/executor.json
        permissions: code_write    # the only two that may write are here
        skills: []

      fixer:
        label: Fixer
        seats: [fixer]
        profile: claude-balanced
        prompt: .vibestrate/roles/fixer.json
        permissions: code_write
        skills: []

      reviewer:
        label: Reviewer
        seats: [reviewer, challenger]
        profile: claude-balanced
        prompt: .vibestrate/roles/reviewer.json
        permissions: read_only     # a reviewer that cannot edit cannot "fix"
                                   # its own complaint away
        skills: []

      verifier:
        label: Verifier
        seats: [verifier, arbiter]
        profile: claude-balanced
        prompt: .vibestrate/roles/verifier.json
        permissions: read_only
        skills: []

# Which crew a run uses when it does not name one. Must exist in `crews`.
defaultCrew: default
```

<div class="docs-callout">

**Did you know?** Every role in a fresh project points at the same profile, so your reviewer starts out as the same model that wrote the code. Pointing `reviewer` and `verifier` at a second profile is the single highest-value edit on this page - see [why a human stays in the loop](/docs/getting-started/why-a-human).

</div>

## Going deeper

### Splitting the crew across two models

Add a profile for the second provider, then move the two judging roles onto it. Cross-model review by construction, not by remembering to open another chat.

```bash
vibe provider setup                       # configure the second CLI first
vibe profile add codex-balanced --provider codex --power medium
vibe crew set-profile reviewer codex-balanced
vibe crew set-profile verifier codex-balanced
vibe crew show                            # confirm both moved
```

### Role files

`prompt:` points at a JSON role file, not prose. `vibe init` writes one per role under `.vibestrate/roles/`:

```json
{
  "schemaVersion": 1,
  "id": "planner",
  "label": "Planner",
  "prompt": "You turn a task brief into an ordered plan..."
}
```

A pointer at a `.md` file is a stale config from an older version; the loader says so and names the migration. Doctor catches it before a run does - [Setup](/docs/cli/dashboard) in the dashboard, or `vibe doctor`.

### Permissions

`permissions:` names a key in the project's `permissions.profiles` block, not a free-form string. `read_only` seats run the provider with its own no-write mode where it has one, so the constraint is enforced by the CLI rather than requested in a prompt. More in [Safety](/docs/concepts/safety).

### Presets

Four ready-made crews ship. They write the same block:

```bash
vibe crew presets              # fast, thorough, cheap, local
vibe crew presets add thorough
vibe crew default thorough
```

### From the CLI

```bash
vibe crew show                 # roles, their profiles, and the seats they fill
vibe profile list              # every profile and the provider behind it
vibe flows show default        # whether this crew covers a flow's seats
```

The schemas live in `src/agents/crew-schema.ts`, `src/agents/role-schema.ts` and `src/agents/profile-schema.ts`. The full `project.yml` surface is in [the config reference](/docs/reference/config).
