---
title: Vibestrate docs
description: Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.
slug: index
---

## In simple words

You have the models. Vibestrate takes over the logistics of putting several of them on one task: pasting the same context into each tool, keeping a spare checkout so a risky change cannot reach your files, carrying one model's output into the next one's prompt, and catching where they drift apart.

`vibe ui` opens the dashboard on `127.0.0.1:4317`, and it drives the coding CLIs already installed on your machine. The final call stays yours.

![The header of a finished run reading merge ready, with the task, the flow it followed and its eight steps, the elapsed time and the diff.](/media/docs/scoped/run-header.png)

<div class="docs-callout tip">

**Tip.** New here? Read [the big picture](/docs/getting-started/big-picture) for the vocabulary, then open the dashboard and run one task. The words land faster once you have watched a run happen.

</div>

## What you get

<div class="docs-cards">

**One plan, every model**
Same project context, same plan, same story so far.

**A reviewer that did not write it**
Cross-model review by construction, not by remembering to open a new chat.

**A copy of your repo per run**
Your branch is untouched until you decide.

**A record you can re-read**
Every decision, token and dollar, written down locally.

</div>

<div class="docs-callout">

**Did you know?** There is no Vibestrate account, no cloud backend and no relay. It spawns the vendor CLIs you are already logged into, so your keys never pass through it and your bills come from those vendors directly.

</div>


## A crew, not one model

The Default flow seats three workers - planner, implementer and reviewer - across four steps, and you choose the provider and model behind each seat. Put the reviewer on a different model from the implementer: when the reviewer asks for changes, the work goes back to the implementer itself, up to three passes. A model reviewing its own work can only lower its own confidence. The `deep` flow keeps the six-seat pipeline - an architect ahead of the implementer, a dedicated fixer answering review rounds, and a separate verifier taking the last look.

![A finished run on the Default flow. All eight steps are ticked, from Plan to Verify, each with its token count and spend. The Run assurance panel reads verified across its four lanes: policy, validation, review and verification. The Run dashboard header offers View diff, Workspace, Copy cd, Re-run with changes, Flow & why and Live metrics.](/media/docs/run-merge-ready.png)

Run assurance is the verdict across four lanes. Flow & why records which flow ran and where that choice came from; View diff, Workspace and Copy cd reach the branch it left behind.

![A blocked run on the Express flow. The Run assurance panel shows review as changes requested and verification as failed. The reviewer's finding says the new code writes userId to stdout on every rejected save. The available actions are View review, Re-run with fixes, Pause and Abort.](/media/docs/run-blocked.png)

Verification failed behind the review, so the run stopped at blocked. View review opens the finding; Re-run with fixes sends the work back with it attached. One model wrote the change, a second one caught it.

![A finished run on the Default flow, eight steps from Plan to Verify. The supervisor log carries four judgments: verify passed, review approved, review checks 2 project policies named no-console-logging and validate-inputs, and review aimed through 3 lenses. Run assurance reads verified across policy, validation, review and verification. The Live metrics panel names codex against the verifier, while the Plan and Architecture rows below run on claude-balanced.](/media/docs/run-cross-model.png)

Claude planned, architected and wrote this change; Codex reviewed and verified it, and the reviewer checked this project's own policies by name rather than leaving them in a file nobody reads.

A run works in a separate git worktree on its own branch. It never pushes and never merges. Every prompt, output and decision is written under `.vibestrate/runs/`, one folder per run. It stops at one of four outcomes:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is finished and waiting for your call.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier found something you should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something broke mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself.</span></div>
</div>

<div class="docs-callout">

**Where the worktree boundary ends.** `node_modules`, `.venv` and `venv` are symlinked from your project into the worktree so your tests can run there. An agent with write permission can write back through those links into your project's installed dependencies, never into your tracked source. `git.linkEnvironment: off` turns the links off.

</div>

## The flow is chosen per task

`defaultFlow` is unset in a fresh project, so with nothing pinned Vibestrate decides per task: a short, low-risk task can be sized down to `express`, a risk-tagged one can be upgraded by your supervisor persona, and a brief that reads like "build me a whole system" runs the read-only [Spec-up](/docs/concepts/spec-up) chain first. More in [Flow](/docs/concepts/flow).

## Crew, rules and recipes

Crew maps each role to the seats it fills and the profile it runs on; its Providers tab detects, sets up and tests the local CLIs. Policies hold your project's rules, each set to advise, which the reviewer checks, or block, which caps the run at merge time; the four hard guards sit below them, already on. Flows are the run recipes: 16 ship built in, New flow opens the builder, and Draft a flow turns a sentence into a project-owned one you can edit.

![The Crew page. Each role is listed as a row naming the Seats it can fill and the Profile it runs on.](/media/docs/crew.png)

![The Policies page. Guards on reads 4 of 4 and the counters read 2 advise, 0 block, 0 pending, 0 engine rules. Your policies lists two rules tagged advise: one forbidding console.log in source files, one requiring unknown keys to be rejected at the boundary. Hard guards lists four switches that are on: forbid main-branch writes, forbid secrets access, forbid auto-push and forbid auto-merge.](/media/docs/policies.png)

![The Flows page. One card per flow, each with a bar of its steps colour-coded by step kind and an Open button, one marked project-owned. New flow, Import and Draft a flow sit in the header.](/media/docs/flows.png)

Vibestrate detects eleven coding CLIs and configures five on its own - claude, codex, gemini, aider and ollama. [The provider reference](/docs/reference/providers) covers what the other six need:

<div class="docs-chips"><span>Claude Code</span><span>Codex CLI</span><span>Gemini CLI</span><span>OpenCode</span><span>Aider</span><span>Ollama</span><span>Qwen Code</span><span>Crush</span><span>Goose</span><span>Cursor CLI</span><span>Amp</span></div>

Nothing leaves your machine unless you ask: browsing the Flow Hub, importing a Flow by URL, fetching a skill, passing `--context-url`, exporting metrics to your own collector, or configuring an `http-api` provider that calls a model API directly.

## Every run stays on the record

All runs lists every run in the project with its review and verification outcome and duration. Replay walks a finished one step by step from what was saved on disk, and the Scheduler strip decides what starts next.

![The All runs page. Four runs sit in a table with Status, Review, Verify and Duration columns, one of them merge-ready. A Filter by task or id box sits above, with Open the board, Replay and Prune snapshots controls, and a Scheduler strip carrying Start the queue.](/media/docs/runs-list.png)

## Where to go next

<div class="docs-cards">

**[Quick start](/docs/getting-started/quickstart)**
Point the dashboard at a coding CLI you already have and take one task from a sentence to a branch you can keep.

**[Full walkthrough](/docs/getting-started/walkthrough)**
The tour: the dashboard, flows, crews, policies, spec-up and the merge path.

</div>

## How these docs are laid out

Every page follows the same shape, so you can skim one the way you skim any
other.

| Part | What it is |
|---|---|
| **In simple words** | The first section on every page. Plain language, no jargon, enough to decide whether you need the rest. |
| The middle sections | The actual behaviour, in the order it happens. Each is a chapter you can link straight to. |
| **On this page** | The rail on the right. Every chapter, one click each. |
| `Next:` | The last line, naming the page that follows this one. Read them in order and you have read the manual. |

Three kinds of page, and it is worth knowing which you are on:

<div class="docs-cards">

**Concepts**
One idea each: [Task](/docs/concepts/task), [Flow](/docs/concepts/flow),
[Crew](/docs/concepts/crew), [Run](/docs/concepts/run). Start here.

**Reference**
Generated from the source, so it cannot drift:
[`project.yml`](/docs/reference/config), [CLI](/docs/reference/cli),
[providers](/docs/reference/providers), [run states](/docs/reference/state-machine).

**Architecture**
How it works underneath: [the schematics](/docs/architecture/schematics),
[the overview](/docs/architecture/overview), [the repository map](/docs/architecture/directory-map).

</div>

<div class="docs-callout tip">

**Tip.** Looking for the diagrams? [Schematics](/docs/architecture/schematics)
collects every figure in the docs on one page, in the order the pieces depend on
each other. It is the fastest way to see the whole system at once.

</div>

## Finding things

<div class="docs-cards">

**Search**
Press `/` anywhere. It matches page titles and section headings.

**A field you saw in a config**
The concept page for that type has a *What a X carries* table naming every
field, and [`project.yml`](/docs/reference/config) has the generated,
complete list.

**A command you half remember**
[CLI commands](/docs/reference/cli) is generated from the program itself, so
every flag on it is real.

**Ask your own project**
`vibe consult "why did that run stop?"` answers from your files, config and runs
plus these docs. Read-only, and it starts nothing.

</div>

## Where these docs come from

The pages are markdown in the product repository under `docs/content/`, and the
reference pages are generated from the code itself: the CLI page from the
command tree, the config page from the Zod schema, the provider and flow pages
from their catalogs. That is deliberate. Anything a person writes by hand can go
stale; anything generated cannot say a flag exists that does not.

The handwritten pages are kept honest by tests rather than by review. A page may
not hide its content behind one catch-all chapter, a field table may not name a
field the schema does not have, and a diagram may not hard-code a colour or
drift from the copy of itself on another page. Those checks run in CI, so the
docs fail the build rather than quietly rotting.

## The terminal, when you want it

`vibe` on its own opens the interactive shell, the terminal-native version of the same surfaces: Dashboard, Flow, Crew and seven more as numbered tabs, with a `:` palette for the rest. See [the interactive shell](/docs/cli/shell).

Commands are the automation path: a script, a CI job, an unattended run.

```bash
vibe ui                                            # the dashboard on 127.0.0.1:4317
vibe init                                          # scaffold .vibestrate/
vibe run "Add audit logging to the settings flow"  # plan, build, validate, review
vibe status                                        # the runs in this project
```

`vibe run` takes `--flow`, `--crew`, `--profile`, `--skills`, `--read-only` and `--unattended`. `vibe steer <runId> <note>` queues a note onto a live run, applied at the next step boundary. `vibe consult "<question>"` answers from your project's real contents without touching them.

Start at [the CLI overview](/docs/cli/overview), then [the command reference](/docs/reference/cli). [Create and run a task](/docs/workflows/create-and-run) covers wiring runs into your own scripts.
