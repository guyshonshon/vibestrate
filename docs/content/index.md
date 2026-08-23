---
title: Vibestrate docs
description: Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.
slug: index
---

## In simple words

You have the models. Vibestrate takes over the logistics of putting several of them on one task: pasting the same context into each tool, keeping a spare checkout so a risky change cannot reach your files, carrying one model's output into the next one's prompt, and catching where they drift apart.

It drives the coding CLIs already installed on your machine. The final call stays yours.

![The header of a finished run reading merge ready, with the task, the flow it followed and its eight steps, the elapsed time and the diff.](/media/docs/scoped/run-header.png)

<div class="docs-callout tip">

**Tip.** New here? Read [the big picture](/docs/getting-started/big-picture) for the vocabulary, then run one task. The words land much faster once you have watched a run happen.

</div>

## What you get

<div class="docs-cards">

**One plan, every model**
Same project context, same plan, same story so far. Nothing explained twice.

**A reviewer that did not write it**
Cross-model review by construction, not by remembering to open a new chat.

**A copy of your repo per run**
Agents work there. Your branch is untouched until you decide.

**A record you can re-read**
Every decision, token and dollar, written down locally as it happened.

</div>

<div class="docs-callout">

**Did you know?** There is no Vibestrate account, no cloud backend and no relay. It spawns the vendor CLIs you are already logged into, so your keys never pass through it and your bills come from those vendors directly.

</div>


## Going deeper

### A crew, not one model

The Default flow seats six workers - planner, architect, implementer, reviewer, fixer and verifier - across eight steps, and you choose the provider and model behind each seat. Put the reviewer on a different model from the implementer and the diff gets read by something that did not write it. They share one plan and one project context, so nobody starts over. The reviewer reads the diff cold and a separate verifier takes the last look, because a model reviewing its own work can only lower its own confidence.

![A finished run on the Default flow. All eight steps are ticked, from Plan to Verify, each with its token count and spend. The Run assurance panel reads verified across its four lanes: policy, validation, review and verification. The Run dashboard header offers View diff, Workspace, Copy cd, Re-run with changes, Flow & why and Live metrics.](/media/docs/run-merge-ready.png)

Run assurance is the verdict across four lanes, and verified means the change is finished and waiting on you. Flow & why records which flow ran and where that choice came from. View diff, Workspace and Copy cd take you to the branch it left behind.

![A blocked run on the Express flow. The Run assurance panel shows review as changes requested and verification as failed. The reviewer's finding says the new code writes userId to stdout on every rejected save. The available actions are View review, Re-run with fixes, Pause and Abort.](/media/docs/run-blocked.png)

This run took the Express flow, and the reviewer came back with changes requested: the new code writes `userId` to stdout on every rejected save. Verification failed behind it, so the run stopped at blocked. You read the finding under View review, then fix it yourself or hit Re-run with fixes. One model wrote the change, a second one caught it, and you make the call.

![A finished run on the Default flow, eight steps from Plan to Verify. The supervisor log carries four judgments: verify passed, review approved, review checks 2 project policies named no-console-logging and validate-inputs, and review aimed through 3 lenses. Run assurance reads verified across policy, validation, review and verification. The Live metrics panel names codex against the verifier, while the Plan and Architecture rows below run on claude-balanced.](/media/docs/run-cross-model.png)

Claude planned, architected and wrote this change; Codex reviewed and verified it. Live metrics names the provider behind each seat, so `codex` sits against the verifier while the earlier steps ran on Claude. A reviewer that did not write the code has no prior answer to defend.

The reviewer also checked this project's own policies by name, `no-console-logging` and `validate-inputs`. Rules you write are handed to the reviewer rather than left sitting in a file nobody reads.

A run works in a separate git worktree on its own branch, so it never edits your working tree. It never pushes and never merges. Every prompt, output, and decision is written under `.vibestrate/runs/`, one folder per run. The run then stops at one of four outcomes and hands the decision back to you:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is finished and waiting for your call.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier found something you should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something broke mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself.</span></div>
</div>

<div class="docs-callout">

**Where the worktree boundary ends.** `node_modules`, `.venv` and `venv` are symlinked from your project into the worktree, so your tests can actually run there. An agent with write permission can write back through those links into your project's installed dependencies. It never reaches your tracked source, and `git.linkEnvironment: off` turns the links off.

</div>

### The flow is chosen per task

There is no "the default one unless you choose another". `defaultFlow` is unset in a fresh project, so with no `--flow` Vibestrate decides per task: a short, low-risk task can be sized down to `express`, a risk-tagged one can be upgraded by your supervisor persona, and a brief that reads like "build me a whole system" runs the read-only [Spec-up](/docs/concepts/spec-up) chain first. Every run records the flow it resolved and the reason, which is what Flow & why shows on the panel above. More in [Flow](/docs/concepts/flow).

### Set the crew, the rules and the recipes

Crew maps each role to the seats it fills and the profile it runs on. Policies hold your project's rules, each set to Advise, which the reviewer checks, or Block, which caps the run at merge time. The four hard guards sit below them, already on. Flows are the run recipes: 14 ship built in, and Draft a flow turns a sentence into a project-owned one you can edit.

![The Crew page. Each role is listed as a row naming the Seats it can fill and the Profile it runs on.](/media/docs/crew.png)

![The Policies page. Guards on reads 4 of 4 and the counters read 2 advise, 0 block, 0 pending, 0 engine rules. Your policies lists two rules tagged advise: one forbidding console.log in source files, one requiring unknown keys to be rejected at the boundary. Hard guards lists four switches that are on: forbid main-branch writes, forbid secrets access, forbid auto-push and forbid auto-merge.](/media/docs/policies.png)

![The Flows page. One card per flow, each with a bar of its steps colour-coded by step kind and an Open button, one marked project-owned. New flow, Import and Draft a flow sit in the header.](/media/docs/flows.png)

Vibestrate detects eleven coding CLIs by name and configures five on its own - claude, codex, gemini, aider and ollama. See [the provider reference](/docs/reference/providers) for what the other six need:

<div class="docs-chips"><span>Claude Code</span><span>Codex CLI</span><span>Gemini CLI</span><span>OpenCode</span><span>Aider</span><span>Ollama</span><span>Qwen Code</span><span>Crush</span><span>Goose</span><span>Cursor CLI</span><span>Amp</span></div>

Your coding tools make their own calls with the credentials they already hold, on your machine. Nothing leaves it unless you ask: browsing the Flow Hub, importing a Flow by URL, fetching a skill, passing `--context-url`, exporting metrics to your own collector, or configuring an `http-api` provider that calls a model API directly.

### Every run stays on the record

All runs lists every run in the project with its review and verification outcome and how long it took. Replay walks a finished one step by step from what was saved on disk, and the Scheduler strip decides what starts next.

![The All runs page. Four runs sit in a table with Status, Review, Verify and Duration columns, one of them merge-ready. A Filter by task or id box sits above, with Open the board, Replay and Prune snapshots controls, and a Scheduler strip carrying Start the queue.](/media/docs/runs-list.png)

### Where to go next

<div class="docs-cards">

**[Quick start](/docs/getting-started/quickstart)**
Install it, point it at a coding CLI you already have, and take one task from a sentence to a branch you can keep.

**[Full walkthrough](/docs/getting-started/walkthrough)**
The tour: the dashboard, flows, crews, policies, spec-up and the merge path.

</div>

### Advanced: CLI and automation

Every screen above has a command behind it, and an unattended run needs one.

```bash
vibe init                                          # scaffold .vibestrate/
vibe run "Add audit logging to the settings flow"  # plan, build, review, verify
vibe status                                        # the runs in this project
vibe ui                                            # open Mission Control
```

`vibe run` takes `--flow`, `--crew`, `--profile`, `--skills`, `--read-only` and `--unattended`. `vibe steer <runId> <note>` queues a note onto a live run, applied at the next step boundary. `vibe consult "<question>"` answers from your project's real contents without touching them.

Start at [the CLI overview](/docs/cli/overview), then [the command reference](/docs/reference/cli). [The interactive shell](/docs/cli/shell) is the terminal-only path, and [create and run a task](/docs/workflows/create-and-run) covers wiring runs into your own scripts.
