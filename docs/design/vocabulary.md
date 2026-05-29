# Vocabulary (canonical terms)

The settled names for Vibestrate's core concepts (Epic D / Phase 0). The model is
`Task + Flow + Crew = Run`. Use these exact words in code, config, UI, and docs.

| Term | Means | Not |
|---|---|---|
| **Flow** | The recipe: ordered **Steps** + the **Seats** they need + gates/loop. The fixed plan→build→verify workflow is the built-in **default flow**. | ~~Guide~~ |
| **Step** | One phase of a Flow. **Reserved** — do not reuse for the Phase-3 card "Checklist / items". | — |
| **Seat** | What a Step needs filled (e.g. `implementer`). A contract the Crew satisfies; the Flow never names local Role ids. | ~~Slot~~ (renamed) |
| **Crew** | Your local team of Roles. A run picks one (default `defaultCrew`). | — |
| **Role** | One teammate in a Crew: prompt, permissions, skills, a **Profile**, and the **Seats** it `fills`. | ~~Agent~~ |
| **Profile** | How strong/expensive a Role runs: provider + model + power + budget + timeout. Power is **provider-specific**. | ~~effortMap~~ |
| **Provider** | A local coding-agent CLI (Claude Code, Codex, Aider, Ollama, OpenCode). Backs Profiles. | ~~Engine~~ |
| **Task** | The plain-language request the user submits. | — |
| **Run** | One execution of a task (its own runId, worktree, artifacts, state). | — |
| **Supervisor** | The product role Vibestrate plays — the review/verification layer over coding agents. | — |
| **Orchestrator** | The internal engine that drives a run's stages. | — |

The chain at run time: **Step → Seat → (Crew) Role → Profile → Provider.** A Flow
declares Seats; the Crew's Roles fill them (via `fills`); each Role names a
Profile; each Profile names a Provider.

## Agent → Role

"Agent" is renamed to **Role** across config, API, code, and UI. One rule
keeps the rename honest:

- **Only the internal seat concept is renamed.** The phrase *"coding-agent
  CLI"* / *"AI coding agents"* refers to the external **provider** tools — the
  industry's term for Claude Code, Codex, etc. That prose stays; it is not the
  role concept.

It is a **clean rename — no backward-compatibility shims.** Vibestrate is
pre-release beta with no published-user config or run history to preserve, so
the old names are simply replaced, not dual-read:

- Config key `agents:` → `roles:` (no fallback read of `agents:`).
- Prompt scaffolding `.vibestrate/agents/<role>.md` → `.vibestrate/roles/<role>.md`.
- Metrics field `agentId` → `roleId`.
- Event types `agent.started|completed|failed` → `role.started|completed|failed`.

## Page model

The dashboard merges the separate **Agents** and **Providers** pages into one
**Crew** page: a Roles section (each role → its provider, permissions, skills)
and a Providers section (detect / configure / test the CLIs). This is what
makes the role↔provider relationship legible in one place.
