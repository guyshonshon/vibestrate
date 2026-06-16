---
title: Why a human stays in the loop
description: AI is fast, but it guesses and it agrees with you. Vibestrate is built so the work is proven before a person makes the final call.
section: getting-started
slug: getting-started/why-a-human
---

AI can write code you could not write yourself - a security fix, a piece of WebGL you have never touched, a database migration. That is the promise. The catch is that the same AI also makes things up, and it tends to agree with whatever you said. Trusting it blind is how bad code ships.

Vibestrate is the layer that makes AI output safe to use. It does the work, then proves the work is good, and leaves the last decision to you.

<div class="docs-callout">

**The honest problem.** An AI model is a confident guesser. It will invent a function that does not exist, miss an edge case, or "fix" a bug by hiding it, and then tell you it is done, because agreeing is what a chat assistant is built to do. None of that is malice. It is just what a model is.

</div>

## What Vibestrate does about it

<div class="docs-cards">

**It checks its own work.** Every run plans, builds, then reviews and verifies the change, often with a [supervisor](/docs/concepts/supervisor) that decides how hard to look and a different model reading the result with fresh eyes. A model reviewing its own code can only lower confidence. A second, different model can actually catch what the first one missed.

**It proves it, with your checks.** Vibestrate runs your real tests and validation commands against the change. "It looks done" is not enough. It has to pass the bar you already set.

**It never gets ahead of you.** A run works in a throwaway copy of your project and stops at a clear outcome. It never pushes your code and never merges the change. Keeping it is something you do on purpose.

**You can just ask.** [Consult](/docs/concepts/consult) is a read-only advisor that knows your project. Ask it whether a change is risky, why a run blocked, or what is left, and it answers from evidence, with its confidence and its blind spots stated plainly.

</div>

## Why it never auto-merges

The merge is the one irreversible step. It puts the change into your real project, where other people and other code depend on it. A model is exactly the wrong thing to trust with an irreversible step it cannot fully verify.

So Vibestrate stops at `merge_ready` and hands you the diff. You read it, or let the [merge advisor](/docs/getting-started/merging) flag the risks for you, and you decide. Slower than full-auto, by design: nothing lands that you did not choose to land.

## You do not have to be an expert

You do not need to know the security rule, the WebGL API, or the migration gotcha. The AI brings that. What you need is a way to trust the result without auditing every line yourself, and that is the whole job Vibestrate does:

<div class="docs-flow">
<div><b>It does the work</b><span>Across models that each see the problem differently.</span></div>
<div><b>It proves it</b><span>Your tests run, a second model reviews, risks are surfaced.</span></div>
<div><b>You decide</b><span>With the evidence in front of you, in plain terms.</span></div>
</div>

You stay the person in charge. You just stop having to do every part of the work yourself.

## Keep going

- [The supervisor](/docs/concepts/supervisor) - how Vibestrate decides how hard to scrutinize a run.
- [Consult](/docs/concepts/consult) - ask the advisor anything, read-only.
- [Keep a change](/docs/getting-started/merging) - what Git is, and how to take a finished run.
