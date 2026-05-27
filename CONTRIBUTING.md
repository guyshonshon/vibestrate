# Contributing to Amaco

Thanks for being here. Amaco is a local‑first, open‑source learning project,
and it gets better every time someone pokes at it. Here's how to help in a way
that lands smoothly.

## The short version

- **Bugs → issues.** [Open one](https://github.com/guyshonshon/amaco/issues/new/choose).
- **Security → private.** See [SECURITY.md](./SECURITY.md). Don't file a public issue.
- **Features → pull requests.** This is the path we encourage most. Build the
  thing, send the PR.

## Reporting a bug

Open an issue with:

- What you ran (the exact `amaco …` command).
- What you expected vs. what happened.
- The `runId` if a run was involved - its artifacts under
  `.amaco/runs/<runId>/` (especially `events.jsonl`) are the fastest path to a
  diagnosis.
- Your OS, Node version (`node --version`), and which provider CLIs are
  installed.

Please redact anything sensitive. Never paste `.env` contents, tokens, or
private source into an issue.

## Proposing a feature

Features come in as pull requests - that's deliberate. If you want to build
something, you don't need permission first; a small heads‑up issue to sketch
the idea is welcome but optional.

Good PRs tend to:

- **Stay focused.** One feature or fix per PR. Small is reviewable; sprawling
  is not.
- **Match the repo.** Read the surrounding code and follow its naming, comment
  density, and structure. Don't reformat unrelated lines.
- **Respect the safety model.** Amaco is local‑first by design - no model APIs,
  no cloud backend, no telemetry, no auto‑push, no auto‑merge, no reading of
  secrets into prompts or logs. Changes that cross those lines won't merge.
- **Come with green checks.**

  ```bash
  pnpm install
  pnpm typecheck
  pnpm test
  pnpm build
  ```

- **Update the docs.** If you change the CLI, config schema, providers, or
  Guides, run `pnpm docs:generate` so the source‑aware reference stays in sync,
  and commit the regenerated `docs/generated/*.json`.

## Working on the docs

The documentation system lives in this repo (`docs/content/` for prose,
`docs/generated/` for the source‑aware reference) and renders at
[amaco.shonshon.com/docs](https://amaco.shonshon.com/docs). Prose edits are
markdown; reference data is generated - never hand‑edit `docs/generated/`.

## Code of conduct

Be kind, be specific, assume good faith. That's the whole policy.

---

Maintained by [Guy Shonshon](https://shonshon.com) - Shonshon, Evolving Technologies.
