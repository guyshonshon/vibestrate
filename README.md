<div align="center">

<img src="./logo.png" alt="Amaco" width="116" />

# Amaco

**The missing piece of vibe‑coding.**

One chat with one model is great for sketches. Real work — refactors, migrations, whole features — wants a *supervised* crew. Amaco runs your existing coding‑agent CLIs through a visible plan → build → review → verify loop, in an isolated git worktree, entirely on your machine.

[![License: MIT](https://img.shields.io/badge/license-MIT-8b7cff?style=flat-square&labelColor=06070b)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-8b7cff?style=flat-square&labelColor=06070b)](./package.json)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.17-8b7cff?style=flat-square&labelColor=06070b)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/macOS%20%C2%B7%20Linux-8b7cff?style=flat-square&labelColor=06070b)](#install)
[![Local‑first](https://img.shields.io/badge/local--first-no%20cloud%2C%20no%20keys-7cc5ff?style=flat-square&labelColor=06070b)](#why-local-first)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-4ade80?style=flat-square&labelColor=06070b)](#contributing)

**[Website](https://amaco.shonshon.com)** · **[Documentation](https://amaco.shonshon.com/docs)** · **[Quickstart](#install)** · **[Concepts](https://amaco.shonshon.com/docs/concepts/task)** · **[Contributing](#contributing)**

</div>

---

## What it is

Amaco is a local‑first orchestrator. You give it a task in plain language; it spins up a git worktree, walks a planner → architect → executor → reviewer → verifier crew through the change, runs *your* validation commands, records every step, and stops at `merge_ready`, `blocked`, or `failed`. It never pushes and never merges — you stay in the chair.

The agents are the CLIs you already have: **Claude Code, Codex, Aider, Ollama, OpenCode** — mix and match per role. Plan with one model, implement with another, review with a third.

## Install

```bash
npm install -g amaco        # macOS / Linux
cd your-project
amaco init                  # scaffold .amaco/ (touches nothing else)
amaco doctor                # check git, providers, validation
amaco run "Add audit logging to the settings flow"
```

Want a dashboard? Add `--ui`:

```bash
amaco run "Tighten retry handling" --ui    # opens Mission Control
```

Full walkthrough → **[amaco.shonshon.com/docs/getting-started/installation](https://amaco.shonshon.com/docs/getting-started/installation)**

## Why local-first

This is the part that matters, so it gets no asterisks:

- **No APIs of ours.** Amaco never holds an API key. It spawns the vendor CLIs you already logged into and reads their output — your prompts and code go straight from those CLIs to those vendors. Amaco is not in the middle.
- **No payments, ever.** Amaco is free. You pay only for the models you choose to run, billed by the vendor, the same as before.
- **No cloud backend, no relay, no telemetry.** Everything runs on your laptop. Nothing phones home. The only network calls are the ones your provider CLIs already make.
- **Your code stays put.** Edits happen in an isolated worktree under your control.
- **Genuinely open source.** MIT licensed, all of it. Read it, fork it, run it offline.

## How a run works

```text
plan → architecture → implement → validate → review → fix → verify
                                      ↑                  │
                                      └──── (loops) ─────┘
```

Each phase is a named agent with one job, so when something goes wrong you can read exactly where the chain broke. Validation is its own phase — it runs the commands in `.amaco/project.yml` (your typecheck, tests, build) as ground truth between "I wrote it" and "looks good to me." Approval gates can pause a run for a human at any phase.

Higher‑stakes work can run a **Guide** instead — a recipe with multiple models arbitrating each other:

```bash
amaco run "Refactor provider permissions" --guide quality-arbitration \
  --guide-slot builder=claude --guide-slot challenger=codex
```

→ [Concepts](https://amaco.shonshon.com/docs/concepts/task) · [Task lifecycle](https://amaco.shonshon.com/docs/task-lifecycle) · [CLI reference](https://amaco.shonshon.com/docs/reference/cli)

## Documentation

Everything lives at **[amaco.shonshon.com/docs](https://amaco.shonshon.com/docs)** — getting started, concepts, workflows, troubleshooting, and a source‑aware reference for every command, config key, provider, and Guide (generated straight from the code, so it never drifts).

## Contributing

Contributions are genuinely welcome — this is a learning project, and a better one with you in it.

- 🐛 **Found a bug?** [Open an issue](https://github.com/guyshonshon/amaco/issues/new/choose) — what you ran, what happened, and the `runId` if you have one.
- 🔐 **Security concern?** Please **don't** open a public issue — see [SECURITY.md](./SECURITY.md) for private disclosure.
- ✨ **Want to build something?** Features come in as **pull requests** — that's the path we encourage most. A quick issue first to sketch the idea is welcome but not required. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Run the checks before you push:

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
```

## Versioning

Amaco follows [SemVer](https://semver.org). We're pre‑1.0 (`0.x`) — the surface is real and tested, but minor versions may still carry breaking changes. The version lives in [`package.json`](./package.json) and flows into `amaco --version` and the generated docs reference.

## License

[MIT](./LICENSE) for the software. Use it, fork it, ship it.

<div align="center">
<br />

Built with care by **[Guy Shonshon](https://shonshon.com)**

<a href="https://shonshon.com">
  <img src="./.github/assets/shonshon-on-light.png#gh-light-mode-only" alt="Shonshon — Evolving Technologies" height="20" />
  <img src="./.github/assets/shonshon-on-dark.png#gh-dark-mode-only" alt="Shonshon — Evolving Technologies" height="20" />
</a>

<sub>Shonshon — Evolving Technologies · made for the love of building</sub>

</div>
