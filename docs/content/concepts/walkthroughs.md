---
title: Walkthroughs
description: "Show me how" turns an answer into a guided tour - it moves you to the right screen and rings the control it is talking about.
slug: concepts/walkthroughs
---

An answer tells you what to do. A **walkthrough** stands you in front of it. Ask "how do I make a crew?", and the answer arrives with a **Show me how** button. Press it and the dashboard moves to the Crew screen, draws a ring around the control the step is about, says what it is for, and waits for you to press Next.

A walkthrough can only navigate. It opens a screen and points at something on it. It never clicks a button, types in a field, saves, edits your config, or starts a run. That is the same ceiling every button under an answer has, and there is deliberately no third kind of action, because a third kind is how a chat button turns into an unreviewed effect. The pressing stays yours.

Two kinds exist. Both open the same overlay, with the same privilege.

## Written down, or built for your question

<div class="docs-cards">

**Authored** - five walkthroughs for the five things most people do first. Every screen and every control they name is a literal the compiler checks and a test greps for, so they cannot drift into pointing at something the app no longer has.

**Generated** - everything else. A model writes the steps for the question you actually asked, and every step is checked against the real screens before anything opens.

</div>

The five authored ones are **Tour the dashboard**, **Make a crew**, **Make a flow**, **Run something for the first time**, and **Set a policy**. A question that matches one of those gets it, with no model call to wait for.

## How a generated walkthrough is checked

Nothing a model wrote opens on trust. Each step names a page and, optionally, one control to ring. Both are checked against the app's real route table and its real list of ringable controls. A step that fails is dropped, and the rest still run.

```text
  ask ──▶ answer ──▶ steps ──▶ checked ──▶ screen
                                  │
                                  └─▶ dropped
```

What gets a step dropped:

<div class="docs-cards">

**A page that does not exist.** The route is matched against the same gate a model-authored button passes through.

**A control that does not exist.** The ring target must be one of the app's real ones. An invented name rings nothing, so the step goes.

**A control on the wrong page.** Ringing the Seats field on the Policies screen can only ever point at nothing.

**A deep link.** Steps go to pages and to blank editors, never to "the flow you mentioned". A wrong deep link is worse than a right page.

</div>

Eight steps is the ceiling, enforced in code; the model is asked for at least two, which is a request rather than a guarantee. If no step survives, nothing opens and the panel says why: *"Every step named a screen or a control this app does not have."* If the model replied in prose instead of a sequence, it says that instead. An honest refusal beats a card pointing at nothing.

## A worked example

Type this into the Supervisor panel:

```text
How do I make a crew?
```

That matches the authored **Make a crew** walkthrough, so pressing **Show me how** runs six steps in this order:

<div class="docs-flow">
<div><b>Crew</b><span>The set of roles a run can hand work to. See what you already have first.</span></div>
<div><b>Providers</b><span>A seat can only use a CLI installed on this machine.</span></div>
<div><b>Profiles</b><span>A profile pairs a provider with a model and an effort level.</span></div>
<div><b>New crew</b><span>Rings the name and description on the blank crew editor.</span></div>
<div><b>Seats</b><span>Rings the seats section: one role bound to one profile.</span></div>
<div><b>Save the crew</b><span>Rings Save. A saved crew is selectable on the new-run form.</span></div>
</div>

The walkthrough moves you between those screens. Naming the crew and pressing Save are still things you do.

## Where the button is

<div class="docs-cards">

**Under a consult answer.** Every answer carries **Show me how**, and it always builds a fresh walkthrough for that question. Type a question the catalog covers and a second button, **Walk me through: Make a crew**, appears beside the composer - that is the authored one.

**In the Supervisor panel.** Only when the question asked to be shown - "how do I", "show me how", "walk me through", "where do I", "what is a". Here **Show me how** does dispatch the authored walkthrough when the question matches one. A question about state ("why did the last run block") gets prose, not a tutorial.

**Consult, "Work in Vibestrate".** The five authored walkthroughs, listed. Open one to read its steps, then press **Walk me through it**, or **Take me there** on a single step to start at that one.

**Press `?` anywhere.** The help overlay carries the dashboard tour and the other four.

</div>

## When a step has nothing to point at

Screens change. If a step's control is not on screen within a few seconds, the card says *"Nothing on this screen matches this step yet."* and lets you carry on to the next step. It does not spin, and it does not disappear.
