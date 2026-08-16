---
title: Supervisor Control
description: The chat panel on Mission Control. It remembers the conversation, answers from your real project, and - when you allow it - turns what you say into a task or a run.
slug: concepts/supervisor-control
---

**Supervisor Control** is the chat panel titled **Supervisor**. It sits on Mission Control, and on the page of any run that is still going. Type what you want. It answers from your real project, and it remembers what was said earlier in the thread.

[Consult](/docs/concepts/consult) answers one question and forgets it. Supervisor Control keeps the thread, so "do the other one instead" has something to point at.

A turn runs in three phases. **Routing** decides what you meant. **Acting** does it. **Answering** writes the reply. Routing only runs when the supervisor is allowed to act, and out of the box it is not - so a message costs one model call and changes nothing.

The control in the panel header is a **permission**, not a stop. It reads **Answers only** or **Answers and acts**, and it decides whether the supervisor may make a task, add TODOs or start a run. Stop is a different control: the red square that replaces Send while a turn is running.

<svg viewBox="0 0 560 112" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A turn goes from you to routing, then acting, then answering, and back to you. When there is nothing to act on, routing skips acting and goes straight to answering.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="48" y="20" width="130" height="40" rx="8"/>
    <rect x="213" y="20" width="130" height="40" rx="8"/>
    <rect x="378" y="20" width="130" height="40" rx="8"/>
    <path d="M26 40 H41"/>
    <path d="M178 40 H206"/>
    <path d="M343 40 H371"/>
    <path d="M508 40 H525"/>
    <path d="M113 60 V92 H443 V67"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M48 40 l-7 -4 v8 z"/>
    <path d="M213 40 l-7 -4 v8 z"/>
    <path d="M378 40 l-7 -4 v8 z"/>
    <path d="M532 40 l-7 -4 v8 z"/>
    <path d="M443 60 l-4 7 h8 z"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="2" y="45">you</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="113" y="45">routing</text>
    <text x="278" y="45">acting</text>
    <text x="443" y="45">answering</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="558" y="45" text-anchor="end">you</text>
    <text x="278" y="107" text-anchor="middle">nothing to act on</text>
  </g>
</svg>

## One turn

**Routing** reads two things: your message, and a list of your open task ids. Nothing else goes in. Not `VIBESTRATE.md`, not the codebase map, not annotations, not file contents, not run output, and not one earlier turn of this conversation. It picks exactly one intent.

```text
answer         a question, or discussion.
task.create    new work, not on an existing task.
checklist.add  TODO items on an existing task.
run.start      build it now, on an existing task.
```

`answer` is the default, and the router is told to choose it whenever it is not certain you asked for work to happen. `checklist.add` and `run.start` both need a task id from that list, so a request that matches none of your tasks cannot become either.

**Acting** is deterministic code. No model runs in this phase, and nothing the router produced is trusted as an argument until it has been checked:

- The task id must be one that was offered. It is never fuzzy-matched, so an invented or injected id goes nowhere.
- The router's echo of your message must match what you actually typed. This catches the subtle attack, where the intent is left alone and the brief is quietly rewritten.
- A run's brief is **your words, verbatim**. Never a model's summary of them.
- `run.start` crosses the [Action Broker](/docs/concepts/safety), so a policy can refuse it.

**Answering** writes the reply, with the full project context and no ability to route anything. One exception is worth knowing: when an action succeeded, the answerer is skipped entirely and the line you get back is fixed text written by code, like `Made a task: "Rate-limit the public API".` That turn costs one model call, not two.

## Three asks, and what comes back

The composer says "Ask anything, or say what you want built" on Mission Control, and "Ask about this run, or say what you want done" inside a run. Both are literal. Here is the range.

**A question about the project.**

> Why did the last run on the checkout task stop before review?

Routing picks `answer`, so nothing is acted on. The reply comes from your real run history, validation evidence and config, and names the stage it stopped at and what the evidence said.

**A request that should become work.**

> We need rate limiting on the public API before launch.

With **Answers and acts** on, routing reads this as new work and picks `task.create`. Acting makes the task and replies with its title. If the work belongs on a task you already have, routing picks `checklist.add` instead and the reply counts what it added - and if that task has a run in flight, it says so plainly, because a checklist run works from the list it started with and new items wait for the next one.

With **Answers only** on, the same sentence gets an answer that tells you where it would go, and nothing is created.

**A question about Vibestrate itself.**

> How do I make a crew that reviews with a different model?

The answer comes from these pages and the real `vibe crew` commands, not a model's memory of some other tool. Under it you get a **Show me how** button, which stands you in front of the screen instead of describing it.

## What streams back

A turn is streamed, so the panel fills in while it works. There are seven kinds of event.

<div class="docs-glossary">

**message.** Your own message, as it was stored, with its real id and timestamp.

**phase.** Which leg is running: routing, acting or answering. Acting can take seconds, because it may be starting a run.

**thinking.** Provider reasoning, verbatim.

**tool.** One tool or sub-agent the provider used, as a short label.

**answer.** The reply as it is written.

**done.** Terminal. Carries the message as it was stored, which is the text that stays.

**error.** Terminal, and nothing was answered. The failure is still written into the thread.

</div>

<div class="docs-callout">

**The live answer is a preview, and the final one can differ.** The answerer replies as JSON, so its raw stream is not readable prose. A small scanner pulls the `answer` field out while it arrives, and it is deliberately naive - it takes the first match. A key-shaped sequence earlier in the response would fool it. That costs a wrong preview and nothing else: the stored message is the parsed, validated answer, and the panel replaces the streamed text with it when `done` lands.

</div>

Thinking and tool lines are pass-through only. They are forwarded where the provider's adapter exposes them, and nowhere else. A provider that exposes no reasoning produces none of these lines, and no substitute narration is invented, because a fabricated "thinking..." trace is worse than honest silence. They are also not saved. Reopen a thread tomorrow and the answers are all there, with no trail behind them.

## Conversations

There are two kinds of thread, and they never mix.

<div class="docs-cards">

**The project thread**, on Mission Control. This is the one that can start runs. Use **New conversation** in the panel header to start another, and the picker beside it to switch.

**A run's thread**, on that run's page. Scoped to one run, because runs really are concurrent and a shared thread would leave "do that again" without a referent.

</div>

The scoping is enforced on the server, in both directions. A run's panel cannot see another run's conversation, and the project panel sees only project threads - never "everything", or Mission Control would adopt whichever run you last talked to as its own.

A run has exactly one thread, so there is nothing to start there and no **New conversation** button. The panel is only on the page while the run is live; once the run is finished there is nothing left to steer, and the thread stays readable in its history.

The answerer sees the **last 6 turns** of the thread. They arrive inside a delimited block, introduced as a record of what was said and not instructions to follow. The router never sees a prior turn at all, because its output can act, and its own earlier words are model-written text that would then be steering the next decision.

## Stop

Stop is the red square beside Send, and it appears only while a turn is running. It aborts the request. That reaches the provider CLI's abort signal, which kills the whole process group - the CLI and any sub-agents it spawned, with a hard kill three seconds later if they have not gone.

<div class="docs-callout warn">

**Stop does not undo what the acting phase already did.** It kills the model process for the leg in flight. A task that was created, checklist items that were added and a run that was started all outlive the request, and are recorded in the thread anyway, because the effect is real and the thread is the audit trail.

</div>

Closing the socket is what stops a turn, so reloading the page or restarting the server does the same thing. Nothing that already happened is taken back by any of them.

Stop is per-turn. It is not the permission switch, and it changes no setting. To take acting away from the supervisor, use the header control, or the CLI:

```bash
vibe supervisor stop --reason "reviewing the diff"
vibe supervisor status
vibe supervisor resume
```

## Who answers, and how hard

Two pickers sit on the composer, next to the attach button.

<svg viewBox="0 0 560 212" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A sketch of the Supervisor panel. Along the top: the title, the permission control reading Answers only, and New conversation. Below it a message with its reply and Show me how actions. At the bottom the composer, carrying the attach button, the profile and effort pickers, and the Send button that becomes Stop while a turn is running.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="558" height="210" rx="10"/>
    <path d="M1 41 H559"/>
    <rect x="286" y="10" width="126" height="22" rx="6"/>
    <rect x="424" y="10" width="124" height="22" rx="6"/>
    <rect x="16" y="58" width="330" height="42" rx="8"/>
    <rect x="16" y="110" width="62" height="20" rx="5"/>
    <rect x="88" y="110" width="104" height="20" rx="5"/>
    <rect x="16" y="142" width="528" height="54" rx="8"/>
    <rect x="30" y="170" width="56" height="20" rx="5"/>
    <rect x="94" y="170" width="76" height="20" rx="5"/>
    <rect x="178" y="170" width="68" height="20" rx="5"/>
    <rect x="442" y="170" width="88" height="20" rx="5"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="16" y="26">Supervisor</text>
  </g>
  <g fill="currentColor" font-size="11" text-anchor="middle">
    <text x="349" y="25">Answers only</text>
    <text x="486" y="25">New conversation</text>
    <text x="47" y="124">reply</text>
    <text x="140" y="124">Show me how</text>
    <text x="58" y="184">attach</text>
    <text x="132" y="184">profile</text>
    <text x="212" y="184">effort</text>
    <text x="486" y="184">Send / Stop</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="30" y="83">a message</text>
    <text x="30" y="163">Ask anything, or say what you want built</text>
  </g>
</svg>

**Profile** chooses who replies to this turn. A profile is a provider plus a model, so changing it changes the effort ladder beside it: the levels always belong to whoever is about to answer.

**Effort** chooses how hard they think about it. The levels are the ones the provider actually has, ordered, with the ends labelled.

Neither is a setting. Both ride on the request and are never written to config, so the project's supervisor is unchanged by either. An effort the chosen provider does not have is refused with that provider's real ladder in the message, rather than passed along to the CLI as an unknown flag.

## Replying to a message

Every message has a reply control. It carries that message into your next turn as a quote, so a follow-up can point at something specific instead of describing it again.

A supervisor message is model-written, and quoting it back puts model output into the prompt of a turn that can act. So it arrives as **quoted material, never as instructions**. Two things make that structural. Every quoted line is prefixed with `> `, which means no line inside the block can equal the closing fence and end the quote early. And the block is announced in the same shape the router uses for your own message, so the model meets one delimiting idiom rather than two.

Long messages are trimmed to a thousand characters, because the turn body is capped server-side and a quote should never eat your send.

## Attaching files

The paperclip picks files, and a strip of removable chips appears inside the composer, above the text field.

<div class="docs-callout warn">

**Attachments are names, not uploads.** Nothing is copied anywhere. The names ride along in your message text as a line reading "Attached for reference: ...", and the agent opens them from the repository it is already working in. This surprises people, and it is deliberate: it keeps a screenshot or a spec out of the run's artifacts and out of anything replayed later. A file the agent cannot reach from the project is a name it cannot open.

</div>

Image thumbnails are drawn from the browser's own file handle and never leave the tab. Attachments and a quoted reply both belong to the turn that carries them, so they leave the composer when you send and do not linger into the next message.

## Show me how

When you ask a procedure question - one containing "how do I", "where can I", "show me how", "walk me through", "what is a" - a **Show me how** button appears under the answer. The answer says what to do in words; this stands you in front of it. The trigger is how you phrased the question, so "why did this run block" gets prose and no button.

A question the catalog already covers gets an authored walkthrough - every target a source literal, checked by the compiler and covered by a test, with no model call to wait for. Everything else gets one built for that question, and every step is checked against the real route table and the real list of controls before anything opens. A step that does not survive is dropped, and a walkthrough left with no steps is refused with the reason on screen.

Both run at the same privilege, and a step is a **destination**. It lands you on the screen, rings the control and says what it is for. Pressing, filling, saving and starting stay yours. See [Walkthroughs](/docs/concepts/walkthroughs) for the full surface.

## Letting it act

Out of the box the supervisor **writes nothing**. It answers, suggests and drafts, and that is all.

```bash
vibe config set supervisorControl.autonomy act
```

turns that up, and so does the header control. In `act` mode, "add a hero section to the landing page" is enough: the supervisor decides where that belongs and does it.

There are exactly two settings, `advise` and `act`. An earlier design had a middle "queue" tier, and it was dropped for being dishonest - queueing a task starts the scheduler, so it runs the work exactly like `act` does, only through another process. A tier that reads as cautious while behaving like the top one is worse than no tier.

<div class="docs-callout warn">

**`act` will not turn on without a budget ceiling.** A run started from chat spends money and its agent runs commands on your machine, and every ceiling ships off. So `supervisorControl.autonomy: act` with no budget limit set is refused at config load, not warned about. Set one first:

```bash
vibe budget set --max-turns-run 40
```

</div>

The header control writes a pause flag, which is separate from the autonomy setting and survives a restart. It **fails closed**: if the flag cannot be read - corrupt, half-written, wrong permissions - the supervisor is treated as paused. A switch that quietly degrades to "go" is not a switch. Talking still works while it is paused, and the router is not called at all, so a paused supervisor is not spending to reach decisions it cannot use.

Every action shows in the thread on the message that caused it, including the ones it refused. A refusal you cannot see is how you end up believing work was queued that never was. Supervisor effects are audited in one place, `.vibestrate/runs/supervisor/`.

## What it cannot do

This is the useful part of the page. The gaps are named rather than smoothed over.

**It cannot edit your code.** The four intents are the whole write surface, and none of them opens a source file. A task and its TODO items are written into `.vibestrate/`, which is Vibestrate's own gitignored state, not your project's files. Code only changes when a run changes it, in a worktree, behind the diff you review.

**Its buttons cannot act.** An action under an answer either fills the composer or opens a page, and there is deliberately no third kind, because a third kind is how a chat button turns into an unreviewed effect. Every id in one is checked against a list the server built, so a model naming a task it invented gets its button dropped rather than fuzzy-matched.

**It leaves no proposals.** Consult can write a pending `VIBESTRATE.md` update or a pending policy row. A supervisor turn does not: it uses the same answering engine, which is read-only, without the surface layer that saves those.

**Gating is uneven, and this matters.** `run.start` crosses the Action Broker, so a policy can deny it. Creating a task and adding checklist items do not cross the broker at all - there is no action kind for either, and inventing one that nothing else emits would put a name in the policy vocabulary that only ever fires here. They are bounded instead: a title and a list of strings, both length-capped, onto a task that was already offered.

**`run.start` can be denied but never held.** `require_approval` on it is rejected when policies load, because there is no approval seam to wait at. A policy either allows it or refuses it.

**A run's thread will not start a second run.** Inside a live run's panel, "build the hero" means add it to what is happening. Asking for a run there is refused, with an offer to add it to the task instead.

**The router's prompt is controlled; the model's reach is not yet.** Everything above describes what Vibestrate puts *into* the router's prompt. The model still runs as a CLI with its working directory at your project root, so a tool-capable one can go and read files on its own, and some CLIs load their own memory file from that directory. Closing that needs a tool-restricted mode on the shared assist runner. Until then, the deterministic checks in the acting phase are what actually stand between a poisoned repository and an action, which is why they are code rather than more instructions to the model.

**Starting a run is not reversible.** It spends money, takes the task lock, creates a branch, and its agent runs commands on your machine. Aborting a run is cooperative: a run mid-turn finishes that turn first. That asymmetry is why `act` is opt-in and why it needs a ceiling.

**It proves a run started, rather than assuming it.** A run is launched detached with its output ignored, so if it dies on startup - a task already locked by another run, a malformed policy set, a bad flow - nothing it printed reaches the chat. The turn watches for the run's own state file for 15 seconds and says the run did not start if it never appears. The alternative is "started a run" in the audit trail for a run that never drew breath.
