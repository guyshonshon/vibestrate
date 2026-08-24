---
title: Supervisor Control
description: The Supervisor chat on Mission Control. It answers from your real project, remembers the thread, and can act once you let it.
slug: concepts/supervisor-control
---

## In simple words

**Supervisor Control** is the chat panel titled **Supervisor**. Type what you want. It answers from your real project - your files, your config, your recent runs - and remembers what was said earlier in the thread.

`vibe ui` opens the dashboard on `127.0.0.1:4317`. The panel is first on **Mission control** by default, above the **New run** composer, and the board is rearrangeable if you want it lower. The same panel sits on any run still in flight, and the consult orb at the bottom right opens it under **Work in Vibestrate**.

<div class="docs-callout tip">

**Tip.** Leave the header switch on **Answers only** while you are learning what it does. On that setting it reads anything and changes nothing, so a misunderstood question costs you a paragraph rather than a run.

</div>

One control matters more than the rest:

![A two-position switch reading Answers only and Answers and acts, with Answers and acts selected.](/media/docs/scoped/sup-switch.png)

That switch is a **permission**, not a stop. It decides whether the supervisor may make a task, add TODOs, or start a run. Stop is a different control: the red square that replaces Send while a turn is running.

<div class="docs-callout">

**Did you know?** Asking about a run from that run's own page means it already knows which run you mean.

</div>

## Going deeper

### One turn

Every turn runs in three legs, and the middle one is code rather than a model.

**Routing** reads two things: your message, and a list of your open task ids. Nothing else - not `VIBESTRATE.md`, the codebase map, file contents, run output, or one earlier turn of this conversation. It picks exactly one intent.

```text
answer         a question, or discussion.
task.create    new work, not on an existing task.
checklist.add  TODO items on an existing task.
run.start      build it now, on an existing task.
```

`answer` is the default, chosen whenever the router is not certain you asked for work to happen. `checklist.add` and `run.start` both need a task id from that list, so a request matching none of your tasks cannot become either.

**Acting** is deterministic code. No model runs in this leg, and nothing the router produced is trusted as an argument until checked:

- The task id must be one that was offered. It is never fuzzy-matched, so an invented or injected id goes nowhere.
- The router's echo of your message must match what you actually typed - catching the subtle attack, where the intent is left alone and the brief is quietly rewritten.
- A run's brief is **your words, verbatim**. Never a model's summary of them.
- `run.start` crosses the [Action Broker](/docs/concepts/safety), so a policy can refuse it.

**Answering** writes the reply, with the full project context and no ability to route anything. When an action succeeded the answerer is skipped and the line you get back is fixed text written by code, like `Made a task: "Rate-limit the public API".` That turn costs one model call, not two.

The turn streams: which leg is running, the provider's reasoning where its adapter exposes it, the tools it used, and the reply as written. Reasoning and tool lines are pass-through only, so a provider that exposes none produces none and no substitute narration is invented. They are not saved either, so reopening a thread tomorrow shows the answers with no trail behind them.

<div class="docs-callout">

**The live answer is a preview, and the final one can differ.** The answerer replies as JSON, so its raw stream is not readable prose. A small scanner pulls the `answer` field out while it arrives, and it is deliberately naive: a key-shaped sequence earlier in the response would fool it. That costs a wrong preview and nothing else - the stored message is the parsed, validated answer, and the panel swaps it in when the turn lands.

</div>

### What comes back

The composer says "Ask anything, or say what you want built" on Mission Control, and "Ask about this run, or say what you want done" inside a run. Both are literal.

A question about the project ("why did the last run on the checkout task stop before review?") routes to `answer` and comes back from your real run history, validation evidence and config. A sentence that describes work ("we need rate limiting on the public API before launch") becomes `task.create`, or `checklist.add` when it belongs on a task you already have - and if that task has a run in flight, the reply says so, because a checklist run works from the list it started with. On **Answers only** the same sentence gets an answer telling you where it would go, and nothing is created.

A question about Vibestrate itself is answered from these pages and the real commands. Ask it as a procedure - "how do I", "where can I", "show me how", "walk me through", "what is a" - and a **Show me how** button appears under the answer. A question the catalog already covers gets an authored walkthrough, every target a source literal checked by the compiler; everything else gets one built for that question, every step checked against the real route table and the real list of controls before anything opens. A step that does not survive is dropped, and a walkthrough left with no steps is refused with the reason on screen. A step is a **destination**: it lands you on the screen, rings the control and says what it is for. See [Walkthroughs](/docs/concepts/walkthroughs).

### Conversations

There are two kinds of thread, and they never mix.

<div class="docs-cards">

**The project thread**, on Mission Control. This is the one that can start runs. **New conversation** in the panel header starts another, and the picker beside it switches.

**A run's thread**, on that run's page. Scoped to one run, because runs really are concurrent and a shared thread would leave "do that again" without a referent.

</div>

Scoping is enforced on the server, in both directions. A run has exactly one thread, so there is nothing to start there and no **New conversation** button, and the panel is on the page only while the run is live.

The answerer sees the **last 6 messages** - three exchanges, counting yours and its own - inside a delimited block introduced as a record of what was said, not instructions to follow. The router never sees a prior turn at all: its output can act, and its own earlier words are model-written text that would then steer the next decision.

### The composer

The paperclip picks files. **Attachments are names, not uploads** - nothing is copied anywhere. The names ride in your message as a line reading "Attached for reference: ...", and the agent opens them from the repository it is already working in. That keeps a screenshot or a spec out of the run's artifacts and out of replay, and a file the agent cannot reach from the project is a name it cannot open. Image thumbnails come from the browser's own file handle and never leave the tab.

Two pickers appear beside it when there is something to pick. **Profile** chooses who replies to this turn, and appears once more than one profile is configured; a profile is a provider plus a model, so changing it changes the effort ladder beside it. **Effort** chooses how hard they think, using the levels that provider actually has. Neither is a setting: both ride on the request, never written to config, and an effort the chosen provider does not have is refused with that provider's real ladder in the message.

Every message has a reply control, carrying it into your next turn as a quote. A supervisor message is model-written, so quoting one back puts model output into the prompt of a turn that can act. It arrives as **quoted material, never as instructions**: every quoted line is prefixed with `> `, so no line inside can equal the closing fence and end the quote early, and the block is announced in the same shape the router uses for your own message. Long messages are trimmed to a thousand characters.

### Stop

Stop aborts the request, which reaches the provider CLI's abort signal and kills the whole process group, with a hard kill three seconds later.

<div class="docs-callout warn">

**Stop does not undo what the acting leg already did.** It kills the model process for the leg in flight. A task that was created, checklist items that were added and a run that was started all outlive the request, and are recorded in the thread anyway, because the effect is real and the thread is the audit trail.

</div>

Closing the socket is what stops a turn, so reloading the page or restarting the server does the same thing. Stop is per-turn and changes no setting.

### Letting it act

Out of the box the supervisor **writes nothing**. Two gates stand in front of acting, and both have to say yes.

**The switch in the panel header** is the fast one. It writes a pause flag that survives a restart, and **fails closed**: a flag that cannot be read - corrupt, half-written or wrongly permissioned - reads as paused. Talking still works while paused, and the router is not called at all.

**The `supervisorControl.autonomy` setting** is the standing one, and ships as `advise`. The switch does not change it, so a fresh project shows **Answers and acts** in the header and still refuses to act, telling you the supervisor is in advise mode. Turn autonomy up once, and the header switch is the control you use day to day. There are exactly two settings, `advise` and `act`. An earlier design had a middle "queue" tier, dropped for being dishonest: queueing a task starts the scheduler, so it runs the work exactly like `act` does, only through another process.

<div class="docs-callout warn">

**`act` will not turn on without a budget ceiling.** A run started from chat spends money and its agent runs commands on your machine, and every ceiling ships off. So `supervisorControl.autonomy: act` with no budget limit set is refused at config load, not warned about. Set one of the five [budget limits](/docs/concepts/safety) first; the refusal names all five.

</div>

Every action shows in the thread on the message that caused it, including the ones it refused. Supervisor effects are audited in one place, `.vibestrate/supervisor/`.

### What it cannot do

**It cannot edit your code.** The four intents are the whole write surface, and none of them opens a source file. A task and its TODO items are written into `.vibestrate/`, Vibestrate's own gitignored state. Code only changes when a run changes it, in a worktree, behind the diff you review.

**Its buttons cannot act.** An action under an answer either fills the composer or opens a page, and there is deliberately no third kind. Every id in one is checked against a list the server built, so a model naming a task it invented gets its button dropped rather than fuzzy-matched.

**It leaves no proposals.** Consult can write a pending `VIBESTRATE.md` update or a pending policy row. A supervisor turn does not: it uses the same answering engine, which is read-only, without the surface layer that saves those.

**Gating is uneven.** `run.start` crosses the Action Broker, so a policy can deny it, though never hold it. A `require_approval` effect on it is rejected when policies load: there is no approval seam to wait at, and the run would get a hard block where its author asked for a pause. Creating a task and adding checklist items do not cross the broker at all - there is no action kind for either, and inventing one that nothing else emits would put a name in the policy vocabulary that only ever fires here. They are bounded by shape instead.

**A run's thread will not start a second run.** Inside a live run's panel, "build the hero" means add it to what is happening. Asking for a run there is refused, with an offer to add it to the task instead.

**The router's prompt is controlled; the model's reach is not yet.** Everything above describes what Vibestrate puts *into* the router's prompt. The model still runs as a CLI with its working directory at your project root, so a tool-capable one can read files on its own, and some CLIs load their own memory file from that directory. Until that is closed, the deterministic checks in the acting leg are what stand between a poisoned repository and an action, which is why they are code rather than more instructions to the model.

**Starting a run is not reversible.** It spends money, takes the task lock, creates a branch, and its agent runs commands on your machine. Aborting one is cooperative: a run mid-turn finishes that turn first. So the turn also **proves** the run started rather than assuming it - a run is launched detached with its output ignored, so the turn watches for its state file for 15 seconds and says the run did not start if it never appears.

### Automation

The interactive shell (`vibe`, or `vibe shell`) has no supervisor chat screen, and nothing in it stands in for one: its **Consult** page is the keyboard-driven review of `VIBESTRATE.md` proposals, where you apply or reject them, which is neither a conversation nor read-only. The commands below are for scripts, for a machine with no browser, and for the autonomy setting, which lives in config rather than on screen.

```bash
vibe supervisor status                              # running, or stopped and why
vibe supervisor stop --reason "reviewing the diff"  # same flag as the header switch
vibe supervisor resume
vibe budget set --max-turns-run 40                  # the ceiling act requires
vibe config set supervisorControl.autonomy act
```

`vibe supervisor stop` and the header switch write the same pause flag, and `status` reports it in the switch's own words. [The CLI overview](/docs/cli/overview) has the shape of the tool; [the command reference](/docs/reference/cli) has every flag.
