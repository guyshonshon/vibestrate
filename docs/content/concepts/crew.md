---
title: Crew
description: Your set of AI workers, and which AI model each one uses.
slug: concepts/crew
---

A **Crew** is your set of AI workers. Each Flow lists the *kinds* of worker it needs - a builder, a reviewer, and so on. Your Crew is who actually shows up to fill those spots.

A Crew lets you put a different model in each seat, so the one that builds the change is not the one that reviews it - they read the problem from their own angle and check each other's work, instead of a single model rubber-stamping its own. The disagreement is the point.

Think of a Flow as a recipe that says "you need a chef and a taster". The Crew is the people you hire for those jobs, and you decide whether the chef is a fast cook or a careful one. The same recipe works no matter who you hire, which is why a Flow someone else wrote still runs with your own people.

Each worker in a Crew is called a **Role**. A Role does two things: it says which steps it can cover, and it picks the actual AI model that does the work.

```yaml
crews:
  default:
    label: Default
    roles:
      backend-implementer:
        label: Backend Implementer
        seats: [implementer, executor, builder]
        profile: claude-sonnet-deep
        prompt: .vibestrate/roles/executor.json
        permissions: code_write
        skills: []
defaultCrew: default
```

This says: a Crew named `default` (set as `defaultCrew`, the one used when you do not pick another) has one Role, `backend-implementer`. The `seats` list is the kinds of step this Role can cover. The `profile` is the setting that names the actual model and provider, so a Role never points at a model directly. See [[profile]] for how that works.

## Picking who runs

A task uses one Crew, defaulting to `defaultCrew`. You can keep more than one - say a fast Crew and a careful Crew - and choose at run time:

```bash
vibe run "task" --crew default
```

If a Flow needs a kind of worker that no Role in your Crew covers, the run stops with a clear message telling you to add that step to a Role. If two Roles both cover the same step, it asks you to pick one.

## Ready-made Crews (presets)

Presets save you from writing a Crew by hand. They all use the same workers as your default Crew, so a Flow's steps stay covered. A preset changes *how* the team runs, not *who* is on it:

<div class="docs-cards">

**`fast`**
Lowest effort, fewer review passes. Quick, low-stakes work.

**`thorough`**
Highest effort, extra review passes. Risky or complex work.

**`cheap`**
The provider's cheapest model at low effort. Keeps spend down.

**`local`**
Runs on a provider on your own machine, off cloud APIs.

</div>

```bash
vibe crew presets           # list them and whether each fits your setup
vibe crew presets add cheap # install one into project.yml
vibe crew use cheap         # make it your default
```

A preset refuses rather than make a copy of your default Crew. `fast` and `thorough` need a provider with effort control (claude, codex), `cheap` needs a provider with a designated cheap model, and `local` needs a local provider separate from your default. The dashboard's Crew page shows the same presets with one-click **Add**.

## Editing a Crew from the dashboard

The Crew page has a **Crew Editor**: one screen holding every Role's parameters (seats, profile, permissions, skills) and its instructions side by side, with a panel showing which of your Flows the Crew as edited can actually run.

Two kinds of change live on that screen, and the editor keeps them apart on purpose:

- **Saves from the page.** A Role's instructions, and its parameters on a Crew that already exists. These write the Role's file and update the Crew in place.
- **You paste by hand.** Adding a Role, removing one, renaming one, changing the Crew's label or its review loops - and everything about a Crew you are creating from scratch. The editor gives you the exact bytes for `.vibestrate/project.yml` and for each Role file; you save them yourself.

The split is not an unfinished feature. Those edits reshape the file that decides how every future run resolves, and the page you review them on is not the place they should happen behind your back. A brand-new Crew is entirely in the second bucket, which is why that page shows no Save button at all - the blocks below it are the deliverable.

The editor refuses the same things a run would: a Role with no seats, two Roles sharing an id, two Roles claiming the same seat, an empty or over-long prompt.

### What happens when you save

Saving a Role is treated as an effect, not as a form submit. Both halves of the Save cross the Action Broker (see [[safety]]) as a `file.write`: the prompt, which is the text a model is handed verbatim on every turn it takes, and the Role's wiring - profile, seats, `permissions`, label, skills - which lands in `.vibestrate/project.yml`. A project policy that denies `file.write` refuses both, you get the policy's own message back, nothing on disk changes, and each decision is recorded in `.vibestrate/runs/roles/actions.ndjson` alongside the other effects that happen outside a run.

The two are gated together on purpose. One Save is two requests, and `permissions` is the one that decides whether a Role's provider may edit your repo - gating only the prompt would have let a policy refuse the instructions while a `read_only` -> `code_write` flip went through, with the refusal message claiming the write was stopped. In the audit log the two are told apart by `purpose`: `role-prompt` names the role file, `role-fields` names `project.yml` and lists the fields the patch touched. Assigning a skill from the Skills page is gated too, as `role-skills` against `project.yml` - it writes one of the fields this page's Save writes, so a policy that stops one has to stop the other. The prompt write itself is atomic, so a save that collides with a reader can't leave a half-written file.

Before the gate, the text is screened. A prompt is refused if it's past 100k characters, if it carries a NUL byte or a control character (a prompt is replayed into another model's prompt and echoed to your terminal, so an escape sequence has no business surviving a save), or if it reads as carrying a **secret** - the refusal names the pattern and the line and shows only a redacted snippet. Secrets are refused rather than scrubbed: a prompt Vibestrate quietly rewrote is a Role that no longer says what you wrote. The practical consequence is worth knowing - a Role whose prompt already contains something the scanner flags can be read but not re-saved until the token comes out.

Three behaviors worth stating rather than leaving you to discover them:

- **The screens are on the prompt only.** The size cap, the character screen and the secret scan run before the prompt's gate. A field patch is gated and validated against the config schema, but its values are not scanned.
- **The character screen is C0 and NUL only.** Unicode direction overrides pass it and are stored as written.
- **A path-scoped rule covers the whole Save, not one half of it.** The prompt and the wiring live in two files, but each half of the Save presents *both* paths to the matcher, so a rule naming `**/.vibestrate/roles/**` and a rule naming `**/project.yml` each refuse both halves - and a skill assignment along with them. A Role's authority is not divisible by which file happens to hold it: a rule that stopped the prompt and let a `read_only` -> `code_write` flip through would be reporting a block it did not perform. The consequence to know is that such a rule is **broader than its glob looks** - one written to freeze instructions also refuses a label rename. There is no `match` that gates one of the two files alone.

## Going deeper

- [[role]] and [[seat]] - the workers in a Crew, and the steps they can cover.
- [[profile]] - how a Role names its actual model and provider.
- [[flow]] - the steps a Crew fills in.
- A Crew can also set `maxReviewLoops` (0 to 10), setting exactly how many fix-and-review passes a run makes. It takes precedence over both the flow's own loop budget and the optional `workflow.maxReviewLoops` global ceiling for runs on this Crew. Roles can carry extra `permissions`, `skills`, and `mcpServers`. See [[configuration]] for the full set of keys. Related: [[provider]].
