<a name="top"></a>

<div align="center">

<img src="./.github/assets/logo.png" alt="Amaco logo" width="108" />

<img src="./.github/assets/hero.png" alt="Amaco" width="480" />

<sub>the missing piece of vibe-coding</sub>

<br />

<sub><b>a local-first supervisor for the coding agents already on your machine</b></sub>

<br />

One chat with one model is great for sketches.
Real work - refactors, migrations, whole features - wants a *supervised* crew.
Amaco runs the coding-agent CLIs you already have through a visible **plan → build → review → verify** loop, in an isolated git worktree, **entirely on your machine.** It finds those CLIs for you, wires them up in one command, and never asks for a key.

<br />

[![License](https://img.shields.io/badge/License-Apache_2.0-8b7cff?style=flat-square&labelColor=0e1118)](./LICENSE)
[![npm](https://img.shields.io/npm/v/amaco-os?style=flat-square&labelColor=0e1118&color=8b7cff)](https://www.npmjs.com/package/amaco-os)
[![Downloads](https://img.shields.io/npm/dm/amaco-os?style=flat-square&labelColor=0e1118&color=8b7cff&label=downloads)](https://www.npmjs.com/package/amaco-os)
[![Stars](https://img.shields.io/github/stars/guyshonshon/amaco?style=flat-square&labelColor=0e1118&color=8b7cff)](https://github.com/guyshonshon/amaco/stargazers)
[![Node](https://img.shields.io/badge/Node-%E2%89%A5%2018.17-8b7cff?style=flat-square&labelColor=0e1118)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-7cc5ff?style=flat-square&labelColor=0e1118)](https://www.typescriptlang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-4ade80?style=flat-square&labelColor=0e1118)](#-contributing)

<br />

[![Website](https://img.shields.io/badge/Website-6951f0?style=for-the-badge&logo=safari&logoColor=white)](https://amaco.shonshon.com)
[![Documentation](https://img.shields.io/badge/Docs-8b7cff?style=for-the-badge&logo=readthedocs&logoColor=white)](https://amaco.shonshon.com/docs)
[![Quick Start](https://img.shields.io/badge/Quick_Start-a78bfa?style=for-the-badge&logo=gnubash&logoColor=white)](#-quick-start)
[![GitHub](https://img.shields.io/badge/Source-2e3548?style=for-the-badge&logo=github&logoColor=white)](https://github.com/guyshonshon/amaco)

</div>

---

<details>
<summary><b>Table of contents</b></summary>

- [Quick start](#-quick-start)
- [Why it exists](#-why-it-exists)
- [What it is](#-what-it-is)
- [Ready in one command](#-ready-in-one-command)
- [Why local-first](#-why-local-first)
- [How a run works](#-how-a-run-works)
- [Full coverage, full control](#-full-coverage-full-control)
- [Documentation](#-documentation)
- [Built with](#-built-with)
- [Contributing](#-contributing)
- [Versioning](#-versioning)
- [License](#-license)

</details>

## ◆ Quick start

Install the `amaco` CLI — one-liner or npm (both need Node ≥ 18.17):

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/guyshonshon/amaco/main/install.sh | sh

# …or with npm directly
npm install -g amaco-os
```

Then point it at any git repo:

```bash
cd your-project
amaco init                     # scaffold .amaco/ - touches nothing else
amaco doctor --fix             # detect providers + project, wire it up
amaco run "Add audit logging to the settings flow"
```

Add `--ui` to any run to open the Mission Control dashboard. New here? [Ready in one command](#-ready-in-one-command) explains what `amaco doctor` detects and wires up for you.

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Why it exists

Vibe-coding with a single chat is a high-wire act. It flies for a sketch - then you hit real work and quietly become the babysitter: re-pasting context the model already forgot, catching the confident-but-wrong refactor *before* it lands, squinting at a diff you never watched get made, and losing count of how many tokens (and dollars) five "quick tries" just burned. One model, one point of view, no record, no brakes.

Amaco trades the high-wire for an assembly line you can see. Your task walks down a row of specialists - a **planner** sketches the change, an **architect** shapes it, an **executor** writes it in a throwaway git worktree, *your own tests* run as the referee, a **reviewer** (ideally a **different** model, so it doesn't share the executor's blind spots) tears into the diff, a **fixer** answers the findings, and a **verifier** signs off. You watch each handoff. You approve the moments that matter. Every prompt, diff, decision, and token is on the record - and nothing merges until you say so.

That's the whole trick: the work that used to live in your head - the plan, the second opinion, the "did it *actually* pass?", the running cost - becomes visible, ordered, and replayable. Same models you already pay for. Your machine. Your call at every gate.

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ What it is

Amaco is a **local-first supervisor for coding agents** - the review-and-verification layer for the AI CLIs already on your machine. You give it a task in plain language; it spins up a git worktree, walks a **planner → architect → executor → reviewer → verifier** crew through the change, runs *your* validation commands, records every step, and stops at `merge_ready`, `blocked`, or `failed`. It never pushes and never merges - you stay in the chair.

The agents are the CLIs you already have - **Claude Code, Codex, Aider, Ollama, OpenCode** - mix and match per role. Plan with one model, implement with another, review with a third.

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Ready in one command

No keys to paste, no YAML to hand-author. Point Amaco at a repo and it figures out the rest:

- **Finds your agents.** Detects the coding-agent CLIs already on your machine - **Claude Code, Codex, Aider, Ollama, OpenCode** - wires up the best one, and assigns the whole crew to it.
- **Reads your project.** Detects the language, package manager, and project type, then suggests the real validation commands (typecheck · test · build) it should run as ground truth.
- **Uses logins you already have.** No API key ever lives in Amaco; it rides the CLIs you've already authenticated, so prompts and code go straight to those vendors.

**`amaco doctor` is the superpower** - the one command that tells you, in plain language, exactly where you stand, and `--fix` closes the gaps for you:

| `amaco doctor` checks | `amaco doctor --fix` does |
|---|---|
| git present · you're inside a repo | configures the detected provider |
| `.amaco/` initialized · config valid | assigns the crew to it |
| project detected (name · type · package manager) | fills validation commands from your project |
| which provider CLIs are installed - and which aren't | restores any missing scaffolding |
| every role points at a real provider, with safe permissions | |
| validation commands are set | |

Green across the board means you're ready to run. Want the dashboard? Add `--ui` to any run:

```bash
amaco run "Tighten retry handling" --ui    # opens Mission Control
```

> Full walkthrough → **[amaco.shonshon.com/docs/getting-started/installation](https://amaco.shonshon.com/docs/getting-started/installation)**

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Why local-first

This is the part that matters, so it gets no asterisks:

| | |
|---|---|
| 🔑 **No APIs of ours** | Amaco never holds an API key. It spawns the vendor CLIs you already logged into and reads their output - your prompts and code go straight to those vendors. Amaco is not in the middle. |
| 💸 **No payments, ever** | Amaco is free. You pay only for the models you choose to run, billed by the vendor, exactly as before. |
| 📡 **No cloud, no telemetry** | Everything runs on your laptop. Nothing phones home. The only network calls are the ones your provider CLIs already make. |
| 🔒 **Your code stays put** | Edits happen in an isolated worktree under your control. No auto-push, no auto-merge. |
| 📖 **Genuinely open source** | Apache-2.0 licensed, all of it. Read it, fork it, run it offline. |

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ How a run works

```text
plan → architecture → implement → validate → review → fix → verify
                                      ↑                  │
                                      └──── (loops) ─────┘
```

Each phase is a named agent with one job, so when something goes wrong you can read exactly where the chain broke. Validation is its own phase - it runs the commands in `.amaco/project.yml` (your typecheck, tests, build) as ground truth between "I wrote it" and "looks good to me." Approval gates can pause a run for a human at any phase.

Higher-stakes work can run a **Flow** instead - a recipe where multiple models arbitrate each other:

```bash
amaco run "Refactor provider permissions" --flow quality-arbitration \
  --flow-slot builder=claude --flow-slot challenger=codex
```

> [Concepts](https://amaco.shonshon.com/docs/concepts/task) · [Task lifecycle](https://amaco.shonshon.com/docs/task-lifecycle) · [CLI reference](https://amaco.shonshon.com/docs/reference/cli)

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Full coverage, full control

Easy to start is only half of it. The trade Amaco makes is unusual: maximum convenience *and* maximum visibility. Every run is a glass cockpit, not a chat log.

- **Watch it happen.** Live, token-by-token output from each agent - the same stream you'd see in the terminal, surfaced in the dashboard.
- **Everything on the record.** Plan, architecture, diff, review findings, fix, verification - each phase writes a named artifact you can read, inspect, and replay.
- **Real cost, real tokens.** A per-step and per-run ledger of tokens and dollars, plus a daily **spend cap** that can warn, downgrade the model, or stop the run when you hit it.
- **Validation as referee.** Your own typecheck / tests / build run between "I wrote it" and "looks good," so review stands on ground truth - not vibes.
- **Your call at every gate.** Approval gates pause for a human; nothing pushes, nothing merges. A run ends at `merge_ready`, `blocked`, or `failed` - you decide what lands.

That's the category in one line: Amaco is a **supervisor**, not an autopilot.

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Documentation

Everything lives at **[amaco.shonshon.com/docs](https://amaco.shonshon.com/docs)** - getting started, concepts, workflows, troubleshooting, and a source-aware reference for every command, config key, provider, and Flow (generated straight from the code, so it never drifts).

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Built with

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev)
[![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev)
[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Contributing

Contributions are genuinely welcome - this is a learning project, and a better one with you in it.

- 🐛 **Found a bug?** [Open an issue](https://github.com/guyshonshon/amaco/issues/new/choose) - what you ran, what happened, and the `runId` if you have one.
- 🔐 **Security concern?** Please **don't** open a public issue - see [SECURITY.md](./SECURITY.md) for private disclosure.
- ✨ **Want to build something?** Features come in as **pull requests** - that's the path we encourage most. A quick issue first to sketch the idea is welcome but optional. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Run the checks before you push:

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
```

<p align="right"><a href="#top">↑ back to top</a></p>

## ◆ Versioning

Amaco follows [SemVer](https://semver.org). We're pre-1.0 (`0.x`) - the surface is real and tested, but minor versions may still carry breaking changes. The version lives in [`package.json`](./package.json) only, and flows into `amaco --version` and the generated docs reference.

## ◆ License

Distributed under the [Apache License 2.0](./LICENSE). Use it, fork it, ship it.

---

<div align="center">

Built with care by **[Guy Shonshon](https://shonshon.com)**

<a href="https://shonshon.com">
  <img src="./.github/assets/shonshon-on-dark.png#gh-dark-mode-only" alt="Shonshon - Evolving Technologies" height="22" />
</a>

</div>
