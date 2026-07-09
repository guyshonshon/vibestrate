# `vibe learn` - deterministic codebase map - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `vibe learn` command (and dashboard surface) that deterministically scans the target project and persists a machine-owned, regenerable codebase map (`.vibestrate/CODEBASE.md` + `.vibestrate/codebase-map.json`) that grounds the planner and consult.

**Architecture:** Mirrors the shipped STATE.md digest pattern (`src/core/project-state-digest.ts`): pure extraction -> pure render -> secret-redacted atomic temp+rename write into `.vibestrate/` (machine-owned, losing it is harmless). Extraction reuses existing bounded utilities only: `detectFullProject` (stack/scripts), `listCodebaseFiles` (git ls-files, secret-path-filtered), `searchCodebaseContent` (git grep, for best-effort HTTP route detection). The rendered map is injected into the planner turn once per run through the existing continuity channel (withheld from clean-room judges), added to consult context, and surfaced read-only on the Codebase page with a Refresh action.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), commander CLI, Fastify routes, React + PageShell/design primitives UI, vitest (tests in top-level `tests/`).

## Global Constraints

- Per the locked model in `docs/design/durable-project-memory.md` ("Reviewed plan (FINAL)"): machine-derived state lives in `.vibestrate/` (regenerable cache), NEVER auto-written into `VIBESTRATE.md`. Do not touch `writeProjectManual`.
- Writes: `writeTextAtomic` (`src/utils/fs.ts:22`) + `redactSecretsInText` (`src/core/diff-service.js`) on the way out. Never a partial write over a good file (build full content in memory first).
- No model calls anywhere in this feature. Extraction is deterministic code only.
- No em-dashes anywhere (use `-`). No emojis. Comments explain why, never phase/plan jargon.
- Tests: vitest, files in `tests/*.test.ts`, temp project via the established `mkdtemp` + `git init` idiom (see `tests/manual-proposals.test.ts:24`).
- Imports within src use `../foo.js` extensions.
- UI composes from `src/ui/components/design/*` and `PageShell`/`PageHeader`/`Section` - never bare `<button>`. Both themes must render correctly.
- HTTP: zod `.strict()` schema + `safeParse`; errors via `HttpError` from `../security.js`. No arbitrary shell from HTTP - the refresh endpoint may only call the same `writeCodebaseMap` function the CLI uses.
- Commit after each task with a conventional message. Run `pnpm typecheck` before every commit.

---

### Task 1: `src/project/codebase-map.ts` - extractor, renderer, writer, loader

**Files:**
- Create: `src/project/codebase-map.ts`
- Test: `tests/codebase-map.test.ts`

**Interfaces:**
- Consumes: `detectFullProject` (`src/project/project-detector.ts:154`), `listCodebaseFiles` (`src/core/codebase-search-service.ts:283`), `searchCodebaseContent` (`src/core/codebase-search-service.ts:143`), `writeTextAtomic` (`src/utils/fs.ts:22`), `redactSecretsInText` (`src/core/diff-service.js`), `vibestrateRoot` (`src/utils/paths.js`), `ensureDir` (`src/utils/fs.js`).
- Produces (later tasks rely on these exact names):
  - `type CodebaseMap` (shape below)
  - `codebaseMapMarkdownPath(projectRoot: string): string` -> `.vibestrate/CODEBASE.md`
  - `codebaseMapJsonPath(projectRoot: string): string` -> `.vibestrate/codebase-map.json`
  - `extractCodebaseMap(projectRoot: string, generatedAt: string): Promise<CodebaseMap>`
  - `renderCodebaseMap(map: CodebaseMap): string` (pure)
  - `writeCodebaseMap(projectRoot: string, generatedAt: string): Promise<{ map: CodebaseMap; markdownPath: string }>`
  - `loadCodebaseMap(projectRoot: string): Promise<{ present: boolean; map: CodebaseMap | null; stale: boolean }>`
  - `renderCodebaseMapForPrompt(map: CodebaseMap, opts?: { maxBytes?: number; stale?: boolean }): string` (pure, bounded, default 4096 bytes)

The type (schema-versioned so the pre-publish no-back-compat rule stays easy - on mismatch, treat as absent, regenerate):

```ts
export type CodebaseMap = {
  schemaVersion: 1;
  generatedAt: string;
  /** git HEAD when generated; null when not a git repo. Drives staleness. */
  rev: string | null;
  project: {
    name: string;
    packageManager: string | null;
    type: string; // nextjs | vite | typescript | node | generic (detectProjectType)
    scripts: Record<string, string>;
    validationCommands: string[];
  };
  /** top-level dirs by tracked-file count, descending, capped at 20 */
  layout: Array<{ dir: string; files: number }>;
  /** file extensions by count, descending, capped at 10 */
  languages: Array<{ ext: string; files: number }>;
  /** paths that exist: package.json main/bin values + conventional entries, capped at 20 */
  entryPoints: string[];
  /** best-effort static route detection; honest about being heuristic */
  httpRoutes: {
    detected: Array<{ method: string; route: string; file: string }>;
    conventionFiles: string[]; // file-convention routes (app/**/route.ts, pages/api/**), capped at 50
    truncated: boolean;
  };
  /** detected tooling markers: vitest, eslint, prettier, docker, github-actions, ... */
  tooling: string[];
  totalTrackedFiles: number;
  /** any cap was hit or a source was unavailable */
  truncated: boolean;
  /** honest degradation notes, e.g. "not a git repository - layout and route scan skipped" */
  notes: string[];
};
```

Extraction rules (all deterministic, all bounded):
- `project.*` from `detectFullProject(projectRoot)` - read its `DetectedProject` return shape in `src/project/project-detector.ts:154` first and map fields; do not re-implement detection.
- `rev` via `git rev-parse HEAD` using the same child-process helper `codebase-search-service.ts` uses (read how its private `git()` helper spawns; if not exported, use `execa("git", ["rev-parse", "HEAD"], { cwd: projectRoot })` with a try/catch -> null).
- `layout`/`languages`/`totalTrackedFiles` from one `listCodebaseFiles({ projectRoot, max: 20000 })` call. If `available` is false, push the degradation note, leave arrays empty, set `truncated: true`.
- `entryPoints`: from package.json `main` + `bin` (string or record values) plus conventional candidates that exist among the tracked paths: `src/index.ts`, `src/index.tsx`, `src/main.ts`, `src/cli/index.ts`, `src/app.ts`, `index.ts`, `index.js`, `app/layout.tsx`, `src/App.tsx`.
- `httpRoutes.detected`: one `searchCodebaseContent` call with an ERE-safe regex (the service falls back from `-P` to `-E`; do not use `\d`/`\w`/`\b`): `(app|router|server|api|fastify)\.(get|post|put|patch|delete)\(` with `regex: true`, then parse each match snippet in JS with `/\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)/` to pull method + route. Read `CodeSearchResult`'s actual shape in `src/core/codebase-search-service.ts` before coding the mapping. Cap at 100 detected routes; set `truncated` when capped or when the search reports its own truncation.
- `httpRoutes.conventionFiles`: from the tracked-path list, paths matching `app/**/route.(ts|js)`, `pages/api/**`, or `src/server/routes/*` (simple string tests, no glob lib). Cap 50.
- `tooling`: presence checks against the tracked-path list: `vitest.config.*` -> `vitest`, `jest.config.*` -> `jest`, `.eslintrc*`/`eslint.config.*` -> `eslint`, `.prettierrc*`/`prettier.config.*` -> `prettier`, `Dockerfile`/`docker-compose*` -> `docker`, `.github/workflows/` prefix -> `github-actions`, `playwright.config.*` -> `playwright`.

`renderCodebaseMap` mirrors the STATE.md self-describing header exactly (see `src/core/project-state-digest.ts:36-45`):

```ts
const header = [
  "# Codebase map (auto-derived)",
  "",
  "> Machine-owned: regenerated by `vibe learn` (and on merge boundaries).",
  "> Do not hand-edit - changes are overwritten. Authored project intent,",
  "> conventions, and lessons live in `VIBESTRATE.md`.",
  "",
  `_Generated ${map.generatedAt}${map.rev ? ` at ${map.rev.slice(0, 12)}` : ""}._`,
  "",
].join("\n");
```

Then sections: `## Stack` (name, type, package manager, validation commands), `## Commands` (scripts as a bounded list, cap 30), `## Layout` (dir - file count lines), `## Languages`, `## Entry points`, `## HTTP routes (best effort)` - explicitly labeled heuristic, `## Tooling`, `## Notes` (only when non-empty). Empty sections are omitted, not rendered blank.

`writeCodebaseMap`: extract -> render -> `redactSecretsInText` the markdown AND `JSON.stringify(map, null, 2)` -> `ensureDir` -> `writeTextAtomic` both files. Both are regenerable caches; JSON is what the server/UI consume, markdown is what humans and prompts consume.

`loadCodebaseMap`: read the JSON path; on missing/parse-error/`schemaVersion !== 1` return `{ present: false, map: null, stale: false }` (regenerate-on-demand beats back-compat). `stale` = map.rev is non-null and differs from current `git rev-parse HEAD` (null current rev -> stale false).

`renderCodebaseMapForPrompt`: `# Codebase map (auto-derived)` section header, then the same body as the file minus the machine-owned banner; truncate at `maxBytes` on a line boundary with a final `-- truncated --` line. Add a one-line staleness warning when the caller passes `stale: true` in opts: `(generated at an older commit - verify against the live repo)`.

**Steps:**

- [ ] **Step 1: Write failing tests** - `tests/codebase-map.test.ts`. Use the temp-project idiom (git init + package.json with scripts + a src file + an express-style route file + vitest.config.ts, committed). Cover: extract returns detected stack/scripts/layout/route/tooling; render includes the machine-owned banner and route section labeled best effort; write creates BOTH files and is re-runnable (idempotent for same inputs modulo generatedAt); load round-trips and reports `stale: false` right after write and `stale: true` after a new commit; non-git dir degrades with note + empty layout, does not throw; a secret-shaped string in package.json scripts gets redacted in the written artifacts; prompt render respects maxBytes.
- [ ] **Step 2: Run tests to verify they fail** - `pnpm vitest run tests/codebase-map.test.ts` - expected: module not found.
- [ ] **Step 3: Implement `src/project/codebase-map.ts`** per the interface above. Before mapping results, actually read `project-detector.ts` and `codebase-search-service.ts` result shapes.
- [ ] **Step 4: Run tests to green** - `pnpm vitest run tests/codebase-map.test.ts`.
- [ ] **Step 5: `pnpm typecheck`, then commit** - `feat(learn): deterministic codebase map extractor and writer`.

### Task 2: `vibe learn` CLI command + `vibe init` wiring

**Files:**
- Create: `src/cli/commands/learn.ts`
- Modify: `src/cli/index.ts` (import + `program.addCommand(buildLearnCommand())` in the addCommand block, lines ~154-190)
- Modify: `src/cli/commands/init.ts:199-201` (before the `Next:` header)
- Test: `tests/learn-command.test.ts`

**Interfaces:**
- Consumes: `writeCodebaseMap`, `loadCodebaseMap` from Task 1; `detectProject` (`src/project/project-detector.js`); `color, header, indent, symbol` from `../ui/format.js`.
- Produces: `buildLearnCommand(): Command`; `runLearn(projectRoot: string): Promise<{ ok: true; map: CodebaseMap; markdownPath: string } | { ok: false; error: string }>` (exported for init + tests; failure is a typed value, not a thrown string).

Command shape - mirror `buildGuideCommand` (`src/cli/commands/guide.ts:16`):
- `vibe learn` - regenerate the map, print a compact summary: ok line with the written path, then indented facts (type, package manager, N tracked files, N routes detected, tooling list) and, when the map carries notes, a warn line each. Exit 1 only when `runLearn` returns `ok: false`.
- `vibe learn show` - print the current `CODEBASE.md` content (via `loadCodebaseMap` -> if absent, a friendly "run `vibe learn` first" line, exit 1 - never a bare stack trace).

Init wiring: in `runInitCommand` right before the `Next:` block, best-effort:

```ts
const learned = await runLearn(detected.projectRoot);
if (learned.ok) {
  console.log(`${symbol.ok()} Learned the codebase -> ${color.bold(".vibestrate/CODEBASE.md")}`);
} else {
  console.log(`${symbol.warn()} Codebase map skipped: ${learned.error} (run ${color.bold("vibe learn")} later)`);
}
```

A learn failure must never fail init.

**Steps:**

- [ ] **Step 1: Write failing tests** - `tests/learn-command.test.ts`: `runLearn` on a temp git project returns ok + writes both artifacts; on an empty non-project dir returns a typed failure (no throw); re-running succeeds (refresh).
- [ ] **Step 2: Verify fail** - `pnpm vitest run tests/learn-command.test.ts`.
- [ ] **Step 3: Implement** `learn.ts`, register in `src/cli/index.ts`, wire init.
- [ ] **Step 4: Green + smoke** - run the suite; then a manual smoke: `pnpm tsx src/cli/index.ts learn` inside a scratch temp project (NOT this repo's root unless you clean up after) and paste the output into the task report.
- [ ] **Step 5: `pnpm typecheck`, commit** - `feat(learn): vibe learn command, wired into vibe init`.

### Task 3: planner grounding + consult context + merge-boundary refresh

**Files:**
- Modify: `src/core/prompt-builder.ts` (new `projectMemory?: string` slot after `projectLedger` at :42; emit after the projectLedger push at :182-185)
- Modify: `src/core/orchestrator.ts` (stash block near :1437-1499; gate + pass near :6160-6200; best-effort `writeCodebaseMap` beside the existing `writeProjectStateDigest` merge-boundary call - grep for it)
- Modify: `src/consult/consult-context.ts` (new section after the VIBESTRATE.md section at :81-90)
- Test: extend `tests/prompt-builder.test.ts` (or create `tests/codebase-map-injection.test.ts`)

**Interfaces:**
- Consumes: `loadCodebaseMap`, `renderCodebaseMapForPrompt`, `writeCodebaseMap` from Task 1.
- Produces: `PromptBuildInput.projectMemory?: string` - pre-rendered, caller-redacted, same contract as `projectLedger`.

Threading (mirror the ledger exactly - one stash, planner-only, once, withheld in clean room):
- Run start: `const cm = await loadCodebaseMap(this.projectRoot); this.codebaseMapBlock = cm.present && cm.map ? redactSecretsInText(renderCodebaseMapForPrompt(cm.map, { stale: cm.stale })).redacted : "";` (new instance field beside `ledgerPromptBlock` at :664). Wrap in the same try/catch posture the ledger stash uses - a bad map never fails a run.
- Per-turn gate (at :6160): reuse `injectContinuity` (planner + `!ledgerInjected`); `const projectMemory = injectContinuity && this.codebaseMapBlock ? this.codebaseMapBlock : "";` and include `projectMemory` in the `if (...) this.ledgerInjected = true;` condition at :6168.
- Pass site (:6198): `...(!cleanRoom && projectMemory ? { projectMemory } : {}),`. Decision, recorded: the map rides the continuity channel (planner-only, clean-room-withheld) rather than the keep-in-clean-room ground-truth channel - judges verify against the live repo, not a summary; and executors' provider CLI reads the repo natively, so broadcasting to every turn is token waste.
- Merge boundary: wherever `writeProjectStateDigest(projectRoot, ...)` is called on run success, add `await writeCodebaseMap(projectRoot, nowIso()).catch(() => {})` with a comment stating it is a best-effort regenerable-cache refresh so the map tracks merges.
- Consult (`consult-context.ts`, after :90):

```ts
const codebaseMap = await loadCodebaseMap(projectRoot);
if (codebaseMap.present && codebaseMap.map) {
  sections.push(renderCodebaseMapForPrompt(codebaseMap.map, { stale: codebaseMap.stale, maxBytes: 6144 }));
  usedSources.push("codebase-map");
}
```

**Steps:**

- [ ] **Step 1: Failing tests** - prompt-builder: `projectMemory` renders as its own section when set, absent otherwise; injection test (follow whatever existing ledger-injection tests do - find them with `rg "projectLedger" tests/`): clean-room step never receives the map section.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** the four touch points.
- [ ] **Step 4: Green** - run the touched suites plus `pnpm vitest run tests/` filtered to orchestrator/prompt/consult tests.
- [ ] **Step 5: `pnpm typecheck`, commit** - `feat(learn): ground planner and consult on the codebase map`.

### Task 4: HTTP endpoints + dashboard surface

**Files:**
- Create: `src/server/routes/codebase-map.ts`
- Modify: `src/server/server.ts` (import + register beside policies at ~:410)
- Modify: `src/ui/lib/api.ts` (client methods on the `api` object at :672)
- Modify: `src/ui/app/routes/CodebasePage.tsx` (new left-rail mode "Map")
- Test: `tests/codebase-map-routes.test.ts` (follow an existing route test - `rg "registerPoliciesRoutes|inject\(" tests/` for the harness idiom)

**Interfaces:**
- Consumes: `loadCodebaseMap`, `writeCodebaseMap`, `CodebaseMap` from Task 1.
- Produces:
  - `GET /api/codebase-map` -> `{ present: boolean; stale: boolean; map: CodebaseMap | null }`
  - `POST /api/codebase-map/refresh` -> same shape after regenerating (no request body; reject non-empty bodies with 400 via a `.strict()` empty-object schema or explicit check)
  - `api.getCodebaseMap()`, `api.refreshCodebaseMap()` in `src/ui/lib/api.ts`

Route module mirrors `src/server/routes/policies.ts` (deps `{ projectRoot }`, `HttpError` from `../security.js` for failures). The POST calls ONLY `writeCodebaseMap` - the same function the CLI uses; no other side effects, no shell.

UI: add a fourth mode to the Codebase page's existing left rail (read the current Files/Content/Ask mode switch and extend it - do not fork the page). The Map mode renders:
- `StatTile`s (content-width, violet labels per the primitives contract) for: project type, package manager, tracked files, detected routes count.
- `Section`s for Commands, Layout, Entry points, HTTP routes (best effort), Tooling - dense lists, chalk-300 secondary text, no grey-faint labels, no pills.
- A `Button` "Refresh map" in the mode's header row calling `api.refreshCodebaseMap()` then re-rendering; disabled while in flight with label "Refreshing".
- Explicit states: loading skeleton echoing the layout; empty state is a fork forward ("No codebase map yet" + primary "Generate map" Button firing the same refresh call); error state shows the message + retry Button. A `stale` map shows a flat tinted amber note "Generated at an older commit" beside the refresh action (static, no pulse).

**Steps:**

- [ ] **Step 1: Failing route tests** - GET absent -> `present: false`; POST refresh on a temp project -> `present: true` with map fields; GET after refresh -> present + `stale: false`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** route module + registration + api client + CodebasePage mode.
- [ ] **Step 4: Green + `pnpm typecheck` + `pnpm build`.** Browser click-through: if a preview server is practical, verify the Map mode in both themes and screenshot; otherwise state honestly in the task report that only typecheck/build ran.
- [ ] **Step 5: Commit** - `feat(learn): codebase map dashboard surface with refresh`.

### Task 5: docs, changelog, version

**Files:**
- Create: `docs/design/codebase-map.md` (decision record: why machine-owned `.vibestrate/` file not VIBESTRATE.md fenced block; why planner-only injection; cite durable-project-memory.md's reviewed model; leave room for a review trail)
- Modify: `docs/content/` - the CLI reference page and the concepts page that covers project memory/STATE.md (find them: `rg -l "STATE.md|vibe guide" docs/content/`); add `vibe learn` + the codebase map, voice flowing simple -> detailed, frontmatter required
- Modify: `README.md` (surface mention where the memory/State features are listed)
- Modify: `CHANGELOG.md` (new version section, one or two highlight lines)
- Modify: `docs/TODO.md` (Shipped Phases entry; tick/annotate any related backlog line honestly)
- Run: `npm version minor --no-git-tag-version`, `pnpm docs:generate` (commit the `docs/generated/*.json` diff - the new command is picked up automatically)

**Steps:**

- [ ] **Step 1: Write all docs**, matching existing voice (no "Professional/Simple" labels, hyphens not em-dashes).
- [ ] **Step 2: `npm version minor --no-git-tag-version` + `pnpm docs:generate`** (do not run concurrently with vitest).
- [ ] **Step 3: Verify** `docs/generated/cli-commands.json` now contains `learn`.
- [ ] **Step 4: Commit** - `docs(learn): document vibe learn and the codebase map; bump version`.

### Task 6 (main session, not a subagent): adversarial review, full verification, merge

- [ ] Adversarial review subagent (strongest model) over the full branch diff: write path (atomic/redaction/fail-closed), HTTP surface (validation, no shell, path safety), prompt injection (clean-room regression), UI states.
- [ ] Fix accepted findings; record the review trail in `docs/design/codebase-map.md`.
- [ ] `pnpm typecheck && pnpm test && pnpm build` - full, honest.
- [ ] ff-merge to `main`, push `origin main`, final report.
