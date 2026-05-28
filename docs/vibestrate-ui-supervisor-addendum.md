# Vibestrate UI Supervisor Addendum

## Product Change

Vibestrate must remain fully CLI-friendly and local-first, but it should also provide an optional UI dashboard.

The UI is not the orchestrator.

The UI is a supervisor surface over the same deterministic orchestration engine.

Core rule:

```txt
CLI and UI must share the same core.
No duplicated orchestration logic.
No separate state model.
No separate agent execution model.
```

Vibestrate should work perfectly without the UI:

```bash
vibe run "implement X"
vibe status
vibe abort <run-id>
```

The UI should be optional:

```bash
vibe ui
vibe run "implement X" --ui
```

---

# 1. UI Product Goal

The UI should let the developer supervise autonomous multi-agent task runs.

It should show:

- current run status
- current active stage
- current active agent
- workflow timeline
- agent outputs
- validation results
- changed files
- git diff
- artifacts
- notes / annotations
- blocked states
- approval prompts, in future
- recovery actions, in future

The UI should make Vibestrate feel like a local mission-control dashboard for coding agents.

It should not become a heavy SaaS dashboard.

It should not require login.

It should not require cloud.

It should not require model APIs.

It should run locally.

---

# 2. CLI + UI Relationship

Vibestrate has one core engine.

```txt
core orchestrator
  ↓
state.json
events.ndjson
artifacts
git worktree
validation output
diff snapshots
```

Both CLI and UI read from the same source of truth.

```txt
CLI = terminal interface
UI = local supervisor interface
```

The UI must not execute secret independent flows.

The UI can call Vibestrate local server endpoints, which call the same core services used by CLI commands.

---

# 3. Recommended Architecture

Use a monorepo-style structure:

```txt
vibestrate/
  package.json

  packages/
    core/
      orchestrator
      state-machine
      artifact-store
      event-log
      policy-engine
      provider-runner
      validation-runner
      git-worktree
      diff-service
      notes-service

    cli/
      commands
      terminal output

    server/
      local HTTP/SSE server
      run APIs
      artifact APIs
      diff APIs
      notes APIs

    ui/
      React/Vite app
      dashboard
      timeline
      diff viewer
      annotation UI
```

If keeping a monorepo is too much for the first implementation, keep a single package with internal folders:

```txt
src/
  core/
  cli/
  server/
  ui/
```

But keep boundaries clean.

---

# 4. UI Tech Stack

Use:

```txt
React
TypeScript
Vite
Tailwind CSS
shadcn/ui or lightweight local components
lucide-react
monaco-editor or react-diff-viewer / diff2html for diffs
SSE for live events
```

Prefer SSE over WebSockets for V0 because the dashboard mostly needs one-way live updates:

```txt
orchestrator → UI
```

Use WebSockets later if bidirectional collaboration becomes necessary.

For notes/annotations, normal HTTP POST is enough.

---

# 5. Local Server

Add:

```bash
vibe ui
```

This starts a local server:

```txt
http://localhost:4317
```

Port should be configurable:

```bash
vibe ui --port 4317
```

The local server should:

- serve the UI
- expose run status APIs
- stream events via SSE
- expose artifacts
- expose validation outputs
- expose diffs from worktree
- allow notes/annotations
- allow abort
- optionally allow pause/resume in future

No auth required for V0 if bound to localhost only.

Bind to `127.0.0.1` by default, not `0.0.0.0`.

If allowing external binding later, require explicit flag and document risk.

---

# 6. API Shape

Example local APIs:

```txt
GET /api/runs
GET /api/runs/:runId
GET /api/runs/:runId/events
GET /api/runs/:runId/artifacts
GET /api/runs/:runId/artifacts/:artifactPath
GET /api/runs/:runId/diff
GET /api/runs/:runId/files/changed
GET /api/runs/:runId/validation
GET /api/runs/:runId/notes
POST /api/runs/:runId/notes
POST /api/runs/:runId/abort
```

Live events:

```txt
GET /api/runs/:runId/events/stream
```

Use Server-Sent Events.

Events should come from `events.ndjson`.

If a run is active in the same process, stream live in-memory events and also persist them to NDJSON.

If viewing an old run, replay from NDJSON.

---

# 7. Real-Time Visibility

The UI should show what is happening now.

V0 should support:

- current stage
- current agent
- latest event
- provider started/completed/failed
- validation command progress
- review decision
- final decision

For real-time modified files/diffs:

V0 can implement this by polling git diff every 1–2 seconds while a run is active.

Do not overbuild real-time file watchers if it complicates correctness.

Preferred V0:

```txt
poll git status/diff from worktree
render changed files and diff
refresh while run is active
```

Future:

```txt
chokidar file watcher
stream diff patches
line-level annotations
approval gates
```

---

# 8. Diff Viewer

The UI should include a simple diff viewer.

Must show:

- changed files list
- file status: added, modified, deleted, renamed if available
- unified diff
- easy copy/open artifact controls
- refresh button

V0 can use git commands:

```bash
git status --porcelain
git diff --stat
git diff --no-ext-diff
```

Run these inside the worktree.

Do not read `.env` file contents into diff responses.

If `.env` appears in changed files, show a warning and hide contents.

---

# 9. Notes and Annotations

The UI should support lightweight feedback.

V0 notes:

```txt
run-level notes
artifact-level notes
file-level notes
```

Store notes locally in:

```txt
.vibestrate/runs/<run-id>/notes.json
```

Example:

```json
[
  {
    "id": "note_...",
    "createdAt": "...",
    "scope": "file",
    "target": "src/core/orchestrator.ts",
    "message": "Make sure this path cannot bypass verification.",
    "resolved": false
  }
]
```

UI should allow:

- add note
- mark resolved
- view unresolved notes
- include notes in final report

Do not implement complex inline line comments in V0 unless easy.

Future roadmap:

```txt
line-level diff annotations
inject notes into active run
/btw notes
pause/resume with notes
human approval requests
```

---

# 10. Supervisor UX

The dashboard should have these views:

## 10.1 Runs List

Shows:

- run id
- task
- status
- started
- updated
- branch
- worktree
- final decision

## 10.2 Run Detail

Main view.

Sections:

```txt
Header
Workflow timeline
Active agent card
Live event log
Changed files / diff
Validation results
Artifacts
Notes
Final report
```

## 10.3 Workflow Timeline

Visual stages:

```txt
Created
Planning
Architecting
Executing
Validating
Reviewing
Fixing
Verifying
Merge Ready / Blocked / Failed
```

Each stage shows:

- pending
- running
- passed
- failed
- blocked

## 10.4 Active Agent Card

Shows:

- agent name
- role
- permission profile
- provider
- cwd
- started at
- last output summary if available

## 10.5 Artifacts Panel

Shows artifact files:

- planner prompt/output
- architecture prompt/output
- executor prompt/output
- validation result JSON
- review
- verification
- final report

Render markdown nicely.

Render JSON prettily.

## 10.6 Validation Panel

Shows each command:

- command
- status
- exit code
- duration
- stdout
- stderr

## 10.7 Notes Panel

Shows:

- unresolved notes
- resolved notes
- add note form

---

# 11. CLI Should Remain First-Class

The UI must not be required.

Every action that matters should still be possible through CLI.

V0 CLI commands:

```bash
vibe init
vibe run "task"
vibe status
vibe abort <run-id>
vibe doctor
vibe ui
```

Future CLI commands:

```bash
vibe note <run-id> "message"
vibe pause <run-id>
vibe resume <run-id>
vibe approve <run-id>
vibe reject <run-id>
```

---

# 12. Package Scripts

If including UI in V0, package scripts may include:

```json
{
  "scripts": {
    "dev": "tsx src/cli/index.ts",
    "dev:ui": "vite --config src/ui/vite.config.ts",
    "build": "pnpm build:core && pnpm build:ui",
    "build:core": "tsup src/cli/index.ts --format esm --dts --clean",
    "build:ui": "vite build --config src/ui/vite.config.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

If UI makes V0 too large, implement server/data contracts now and document UI as next phase.

But if the user explicitly wants UI in the initial app, include a simple dashboard.

---

# 13. Important UI Scope Discipline

V0 UI should not implement:

- login
- cloud sync
- team collaboration
- hosted mode
- database
- complex auth
- real-time collaborative editing
- line-level code review comments
- embedded terminal
- auto-merge
- auto-push
- remote agent execution

V0 UI should be:

```txt
local
read-heavy
supervisor-focused
artifact-driven
diff-aware
note-capable
simple
```

---

# 14. Security for UI

UI server must:

- bind to 127.0.0.1 by default
- not expose secrets
- not serve arbitrary filesystem paths
- only serve files from `.vibestrate/runs` and known worktree diff outputs
- prevent path traversal
- hide `.env` diff contents
- not allow arbitrary shell commands from UI
- only call safe Vibestrate actions
- log actions to events

V0 UI actions allowed:

```txt
view runs
view artifacts
view diffs
view validation
add/resolve notes
abort run
```

Do not allow arbitrary command execution from UI.

---

# 15. Final Product Definition Update

Use this definition:

```txt
Vibestrate is a local-first autonomous multi-agent completion orchestrator for software tasks.
```

Expanded:

```txt
Vibestrate coordinates local agent CLIs through a controlled plan → architect → implement → validate → review → fix → verify workflow inside isolated git worktrees, with both a CLI and an optional local supervisor dashboard.
```

Dashboard tagline:

```txt
A local mission-control dashboard for your autonomous coding-agent runs.
```

---

# 16. Acceptance Criteria Additions

Add these to the implementation acceptance criteria:

1. `vibe ui` starts a local dashboard server.
2. Server binds to `127.0.0.1` by default.
3. UI lists runs from `.vibestrate/runs`.
4. UI shows run detail.
5. UI shows workflow timeline.
6. UI shows active/current stage from state/events.
7. UI shows artifacts.
8. UI shows validation results.
9. UI shows changed files and git diff from worktree.
10. UI hides `.env` diff contents.
11. UI supports run-level/file-level notes.
12. Notes persist in `.vibestrate/runs/<run-id>/notes.json`.
13. UI can mark notes resolved.
14. UI can abort a run through safe Vibestrate action.
15. UI does not execute arbitrary shell commands.
16. CLI remains fully usable without UI.
17. UI does not duplicate orchestration logic.
18. Core logic remains testable without browser/UI.

---

# 17. Recommended Implementation Strategy

If implementing in one pass, build in this order:

1. Core run artifacts/state/events.
2. Git diff service.
3. Notes service.
4. Local server API.
5. SSE event stream.
6. Basic React dashboard.
7. Runs list.
8. Run detail.
9. Timeline.
10. Diff viewer.
11. Artifacts viewer.
12. Validation viewer.
13. Notes viewer/editor.
14. `vibe ui` command.
15. Tests for server services and path safety.

Keep the first UI simple but real.

Do not over-polish before the orchestration core works.
