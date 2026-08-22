---
title: Crew
description: Your set of AI workers, and which AI model each one uses.
slug: concepts/crew
---

A **Crew** is your set of AI workers. Each Flow lists the *kinds* of worker it needs - a builder, a reviewer, and so on. Your Crew is who shows up to fill those spots.

You cast it on the Crew page. `vibe ui` opens the dashboard on localhost, and Crew is in the sidebar.

![The Crew page, reached from Crew in the sidebar. The header counts the roles in this crew and the seats they cover. Under Roles, each worker is a card naming the Seats it takes and the Profile it runs on, with its write permission beside the name.](/media/docs/crew.png)

Each worker on that page is a **Role**, and a Role does two things: it lists the Seats it can fill, which are the kinds of step a Flow asks for, and it names the Profile it runs on, which is its model and provider - see [[profile]]. Both are live on the card, and changing one saves against the Crew you're looking at.

A Crew lets you put a different model in each Seat, so the worker that builds a change isn't the one that reviews it. They read the problem from their own angle and check each other's work instead of one model rubber-stamping itself.

Think of a Flow as a recipe that says "you need a chef and a taster". The Crew is who you hire for those jobs, which is why a Flow someone else wrote still runs with your own people.

`vibe init` writes you a `default` Crew with six Roles - planner, architect, executor, fixer, reviewer, verifier - all on one Profile. Four more Crews are ready-made as presets: `fast`, `thorough`, `cheap` and `local`.

## Picking who runs

A task uses one Crew. The crews list marks the one cast for every run, and each card carries **Configure**, **Edit roles** and **Set default**. Keep more than one - say a fast Crew and a careful Crew - and the New run composer sends a single task to either without touching the default, drawing the Flow's Seats against the Crew's Roles so you see the wiring first.

One Role can cover several kinds of step, which is why six workers are enough to staff a Flow with more steps than that. The executor Role in the scaffold takes `implementer`, `executor` and `builder`, and its card shows all three.

If a Flow needs a Seat that no Role in your Crew covers, the run refuses to resolve and tells you to open Crew and add that Seat to a Role. If two Roles both claim the same Seat, it refuses the same way and asks you to name one, either from the composer or with a run override.

## Ready-made Crews (presets)

Presets save you from writing a Crew by hand. They all use the same workers as your default Crew, so a Flow's Seats stay covered. A preset changes *how* the team runs, not *who* is on it:

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

They sit further down the Crew page, one card each with **Add to crews**. Installing one adds a Crew and the Profile it runs on, and nothing runs until you pick it.

A preset refuses rather than make a copy of your default Crew. `fast` and `thorough` need a provider with effort control (claude, codex), `cheap` needs a provider with a designated cheap model, and `local` needs a local provider separate from your default. A card that can't fit says which case it hit and offers the route forward.

## Editing a Crew

**Edit roles** opens the Crew Editor, and **New crew** opens it on a blank one. It's one screen holding every Role's parameters (seats, profile, permissions, skills) and its instructions side by side, with a panel showing which of your Flows the Crew as edited can run.

Two kinds of change live on that screen, and the editor keeps them apart on purpose:

- **Saves from the page.** A Role's instructions, and its parameters on a Crew that already exists. These write the Role's file and update the Crew in place.
- **You paste by hand.** Adding a Role, removing one, renaming one, changing the Crew's label or its review loops - and everything about a Crew you are creating from scratch. The editor gives you the exact bytes for `.vibestrate/project.yml` and for each Role file; you save them yourself.

The split is not an unfinished feature. Those edits reshape the file that decides how every future run resolves, and the page you review them on is not the place they should happen behind your back. A brand-new Crew sits in the second bucket, which is why that page shows no Save button at all - the blocks below it are the deliverable.

The editor refuses the same things a run would: a Role with no seats, two Roles sharing an id, two Roles claiming the same seat, an empty or over-long prompt.

### What happens when you save

Saving a Role is treated as an effect, not as a form submit. One Save is two writes - the prompt, which is the text a model is handed verbatim on every turn it takes, and the Role's wiring, which lands in `project.yml` - and both cross the Action Broker (see [[safety]]) together:

<svg viewBox="0 0 560 104" width="100%" style="max-width:560px;height:auto" role="img" aria-label="One Save on the Crew page writes two files, the Role's prompt file and project.yml, and both cross the Action Broker as a single file.write decision.">
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="280" y="12">one Save on the Crew page</text>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M280 18 V27"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="276.5,27 283.5,27 280,32.5"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="36.5" width="559" height="66" rx="10"/>
    <rect x="14.5" y="62.5" width="259" height="32" rx="7"/>
    <rect x="286.5" y="62.5" width="259" height="32" rx="7"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="14" y="55">one file.write decision - a rule that stops one stops both</text>
  </g>
  <g fill="currentColor" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="144" y="82">roles/executor.json</text>
    <text x="416" y="82">project.yml</text>
  </g>
</svg>

The wiring half is the Role's profile, seats, permissions, label and skills. A project policy that denies `file.write` refuses both halves, you get the policy's own message back, and nothing on disk changes. Each decision is recorded in `.vibestrate/runs/roles/actions.ndjson`, alongside the other effects that happen outside a run.

The two are gated together on purpose. One Save is two requests, and `permissions` is the one that decides whether a Role's provider may edit your repo. Gating only the prompt would have let a policy refuse the instructions while a `read_only` -> `code_write` flip went through, with the refusal message claiming the write was stopped.

In the audit log the two are told apart by `purpose`: `role-prompt` names the role file, `role-fields` names `project.yml` and lists the fields the patch touched.

Assigning a skill from the Skills page is gated too, as `role-skills` against `project.yml`. It writes one of the fields this page's Save writes, so a policy that stops one has to stop the other. The prompt write itself is atomic, so a save that collides with a reader can't leave a half-written file.

Before the gate, the text is screened. A prompt is refused in three cases:

- it is past 100k characters,
- it carries a NUL byte or a control character (a prompt is replayed into another model's prompt and echoed to your terminal, so an escape sequence has no business surviving a save),
- it reads as carrying a **secret** - the refusal names the pattern and the line and shows only a redacted snippet.

Secrets are refused rather than scrubbed: a prompt Vibestrate rewrote on its own is a Role that no longer says what you wrote. The practical consequence is worth knowing - a Role whose prompt already contains something the scanner flags can be read but not re-saved until the token comes out.

Three behaviors worth stating rather than leaving you to discover them:

- **The screens are on the prompt only.** The size cap, the character screen and the secret scan run before the prompt's gate. A field patch is gated and validated against the config schema, but its values are not scanned.
- **The character screen is C0 and NUL only.** Unicode direction overrides pass it and are stored as written.
- **A path-scoped rule covers the whole Save, not one half of it.** The prompt and the wiring live in two files, but each half of the Save presents *both* paths to the matcher. So a rule naming `**/.vibestrate/roles/**` and a rule naming `**/project.yml` each refuse both halves - and a skill assignment along with them.

  A Role's authority is not divisible by which file holds it, so such a rule is **broader than its glob looks** - one written to freeze instructions also refuses a label rename. There is no `match` that gates one of the two files alone.

## Advanced: CLI and automation

Every Crew page action has a terminal path, for scripts and headless machines. See [the CLI overview](/docs/cli/overview).

A Crew is a block in `.vibestrate/project.yml`, and the page above edits this:

```yaml
crews:
  default:
    label: Default
    roles:
      executor:
        label: Backend Implementer
        seats: [implementer, executor, builder]
        profile: claude-balanced
        prompt: .vibestrate/roles/executor.json
        permissions: code_write
        skills: []
defaultCrew: default
```

`defaultCrew` is the Crew a run uses when it does not pick one.

```bash
vibe crew list                 # crews, with the default marked
vibe crew show default         # its roles, profiles and seats
vibe crew presets              # presets, and whether each fits
vibe crew presets add cheap    # install one into project.yml
vibe crew use cheap            # make it the default
vibe run "task" --crew default # one run on a named crew
```

## Going deeper

- [[role]] and [[seat]] - the workers in a Crew, and the steps they can cover.
- [[profile]] - how a Role names its actual model and provider.
- [[flow]] - the steps a Crew fills in.
- [[provider]] - the tool a Profile names.

A Crew can also set `maxReviewLoops` (0 to 10), setting exactly how many fix-and-review passes a run makes. It takes precedence over both the flow's own loop budget and the optional `workflow.maxReviewLoops` global ceiling for runs on this Crew.

Roles can carry extra `permissions`, `skills`, and `mcpServers`. See [[configuration]] for the full set of keys.
