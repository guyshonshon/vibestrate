---
title: Why a human stays in the loop
description: AI is fast, but it guesses and it agrees with you. Vibestrate proves the work before a person makes the final call.
slug: getting-started/why-a-human
---

AI can write code you could not write yourself - a security fix, a piece of WebGL you have never touched, a database migration. The catch: the same AI also makes things up, and it tends to agree with whatever you said. Trusting it blind is how bad code ships.

<div class="docs-callout">

**The honest problem.** An AI model is a confident guesser. It will invent a function that does not exist, miss an edge case, or hide a bug instead of fixing it, then tell you it is done - because agreeing is what a chat assistant is built to do. None of that is malice. It is just what a model is.

</div>

Vibestrate is built to catch that instead of trusting it. Every run plans, builds, then a different model reviews and verifies the change with fresh eyes - a model reviewing its own work can only lower confidence, a second model can catch what the first missed. It also runs your real tests and validation commands against the result, so "it looks done" is not enough. And it never gets ahead of you: a run works in a throwaway copy of your project and stops at `merge_ready` instead of pushing or merging on your behalf - see [the safety guarantees](/docs/concepts/safety). You read the diff, or let the [merge advisor](/docs/getting-started/merging) flag the risks, and you decide.

You do not need to know the security rule, the WebGL API, or the migration gotcha yourself - the AI brings that. What Vibestrate gives you is a way to trust the result without auditing every line: work done across models that see the problem differently, proven against your checks, handed back with the evidence and the decision. If you want to ask about a run instead of reading it cold, [Consult](/docs/concepts/consult) is an advisor that knows your project, answers from evidence, and never touches your code.

## Keep going

- [The supervisor](/docs/concepts/supervisor) - how Vibestrate decides how hard to scrutinize a run.
- [Consult](/docs/concepts/consult) - ask the advisor anything; it answers, it does not act.
- [Keep a change](/docs/getting-started/merging) - what Git is, and how to take a finished run.
