# Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the canonical design contract (Mission Control's idiom), remove the dead competing primitive set, verify the token crosswalk, and capture the shared reference set - so the page fan-out has one un-ambiguous foundation to build on.

**Architecture:** Phase 0 ships no new screens. It removes the unused shadcn `components/ui/*` set (0 consumers) so `components/design/*` is unambiguously canonical, verifies the rollout doc's flagged crosswalk rows against the live migrated Mission Control, captures a committed reference set, and writes `docs/design/primitives-contract.md` - the single file every page-redesign agent reads. `SectionEyebrow` stays (9 consumers on un-migrated pages) and is documented as retire-on-migration, never half-deleted.

**Tech Stack:** React + TypeScript + Tailwind (arbitrary-value idiom), Vite build, lucide-react icons, Vitest. Preview MCP for screenshots.

## Global Constraints

- Canonical token set only in any new/edited code: `chalk-100/300/400`, `violet-soft/mid/deep`, `amber-soft`, `sky-glow`, `rose-300`, emerald, `coal-400..900`, `--card`, `--background`, `--line(-soft/-strong)`. Never `vibestrate-*` / `fog-*` in new code.
- No em dashes anywhere (use `-`). No emojis anywhere. (User standing rules.)
- No pill-rounded labels; no pulse/breathing animation on chrome (consult orb exempt); no eyebrow kickers; no naked status dot + sentence; cards dense not airy.
- Phase 0 touches no `vibestrate-*` / `fog-*` migration surface - those are later phases.
- Verify gate for the branch: `pnpm typecheck && pnpm test && pnpm build` all green before final report.
- After UI-affecting changes, `pnpm build` so the served `dist/ui` reflects reality.

---

### Task 1: Remove the dead shadcn primitive set

Makes `components/design/*` unambiguously canonical by deleting the unused parallel set. Audit confirmed 0 import consumers for each of `components/ui/{badge,button,card,input,label}`.

**Files:**
- Delete: `src/ui/components/ui/badge.tsx`
- Delete: `src/ui/components/ui/button.tsx`
- Delete: `src/ui/components/ui/card.tsx`
- Delete: `src/ui/components/ui/input.tsx`
- Delete: `src/ui/components/ui/label.tsx`
- (Delete the `src/ui/components/ui/` dir if it ends up empty.)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Confirms `components/design/*` is the only primitive set.

- [ ] **Step 1: Prove zero consumers (any import shape, not just the path I grepped)**

```bash
cd /Users/guy/Programming/vibestrate
# Any import that resolves into components/ui/ — relative or aliased, with/without extension.
rg -n "components/ui/(badge|button|card|input|label)|from ['\"].*\bui/(badge|button|card|input|label)" src/ui -g '*.tsx' -g '*.ts'
# Also catch a barrel re-export.
rg -n "from ['\"].*components/ui['\"]" src/ui -g '*.tsx' -g '*.ts'
ls src/ui/components/ui/
```

Expected: the first two `rg` calls print **nothing** (exit 1). `ls` lists exactly `badge.tsx button.tsx card.tsx input.tsx label.tsx` (no `index.ts` barrel). If any consumer or a barrel appears, STOP - do not delete; report the unexpected consumer instead.

- [ ] **Step 2: Delete the files**

```bash
cd /Users/guy/Programming/vibestrate
git rm src/ui/components/ui/badge.tsx src/ui/components/ui/button.tsx src/ui/components/ui/card.tsx src/ui/components/ui/input.tsx src/ui/components/ui/label.tsx
rmdir src/ui/components/ui 2>/dev/null || true
```

- [ ] **Step 3: Verify typecheck + build still green**

```bash
cd /Users/guy/Programming/vibestrate
pnpm typecheck && pnpm build
```

Expected: both PASS. (If a build error surfaces an import we missed, that contradicts Step 1 - investigate, do not force.)

- [ ] **Step 4: Commit**

```bash
cd /Users/guy/Programming/vibestrate
git add -A
git commit -m "refactor(ui): delete unused shadcn primitive set (design/ is canonical)"
```

---

### Task 2: Verify the token crosswalk against live Mission Control

Resolve the rollout doc's flagged crosswalk rows (the ones marked "verify" / "judgment" / "differs") to concrete decisions, grounded in `index.css` hex values and the rendered exemplar. Output is an updated, authoritative crosswalk table.

**Files:**
- Read: `src/ui/index.css` (token blocks, dark `:root` and `:root.light`)
- Modify: `docs/design/design-system-rollout.md` (the crosswalk table's Match column)

**Interfaces:**
- Consumes: `index.css` token values.
- Produces: a crosswalk where every row is either `verified -> <target>` or `retire`, no row left `verify`/`judgment`. Page agents trust this table.

- [ ] **Step 1: Extract the exact hex for every flagged old + new token**

```bash
cd /Users/guy/Programming/vibestrate
rg -n "vibestrate-(fg|fg-dim|fg-muted|panel|canvas|success|warn|fail)|fog-(100|200|300|400|500)|--color-(chalk-100|chalk-300|chalk-400|coal-600|coal-800|coal-900)|--background|--card|amber-soft|emerald|rose" src/ui/index.css
```

Expected: prints the dark-theme and light-theme definitions. Record each old->new hex pair.

- [ ] **Step 2: Render Mission Control in both themes and eyeball the flagged surfaces**

Start the preview (`preview_start`), open Mission Control, screenshot dark, toggle theme, screenshot light. Confirm by eye that the migrated screen's surfaces/text/status colors match the *new* tokens (so the crosswalk target is what's actually on screen, not a guess).

- [ ] **Step 3: Resolve each flagged row and rewrite the table**

Edit the crosswalk table in `docs/design/design-system-rollout.md`: for each flagged row replace the "verify"/"judgment" note with the decided target and the word `verified`. Decisions to encode (confirm against Step 1/2 before writing; these are the expected resolutions):
- `vibestrate-fg` -> `chalk-100`; `vibestrate-fg-dim` -> `chalk-300`; `vibestrate-fg-muted` -> `chalk-400` (accept the lighter muted; note the shift is intentional).
- `fog-100/200/400` -> `chalk-100/300/400`; `fog-300/500` -> nearest `chalk-300/400`.
- `vibestrate-panel` -> `--card`; elevated surfaces pick `coal-600/coal-800` by elevation, not 1:1.
- `vibestrate-canvas` -> `--background`/`coal-900` (it is darker; accept new `--background`).
- `vibestrate-success` -> `emerald-400`; `vibestrate-warn` -> `amber-soft`; `vibestrate-fail` -> `rose-300/500`.
- `.eyebrow` / `vibestrate-mono` uppercase -> `retire` (sentence-case heading).

- [ ] **Step 4: Commit**

```bash
cd /Users/guy/Programming/vibestrate
git add docs/design/design-system-rollout.md
git commit -m "docs(design): verify token crosswalk against live Mission Control"
```

---

### Task 3: Capture the shared reference set

Give every page agent the same visual inputs so nobody invents. Required references are self-contained (no external browsing): the brand frame + screenshots of the live exemplar. External captures (LOUD, Raycast) are best-effort.

**Files:**
- Create: `docs/design/references/` (new dir)
- Move: `vibestrate-home.jpeg` -> `docs/design/references/brand-home.jpeg`
- Create: `docs/design/references/mission-control-dark.png`
- Create: `docs/design/references/mission-control-light.png`
- Create (best-effort): `docs/design/references/loud-heyradiant.png`, `docs/design/references/raycast.png`
- Create: `docs/design/references/README.md`

**Interfaces:**
- Consumes: live Mission Control (preview), the untracked `vibestrate-home.jpeg`.
- Produces: a committed reference folder + README the per-page agent brief points at.

- [ ] **Step 1: Create the dir and move the brand frame in**

```bash
cd /Users/guy/Programming/vibestrate
mkdir -p docs/design/references
git mv vibestrate-home.jpeg docs/design/references/brand-home.jpeg 2>/dev/null || mv vibestrate-home.jpeg docs/design/references/brand-home.jpeg
```

(Use `git mv` only if the file were tracked; it is untracked, so plain `mv` then `git add` in Step 4.)

- [ ] **Step 2: Screenshot live Mission Control, both themes**

Via preview MCP: open Mission Control, `preview_screenshot` -> save as `docs/design/references/mission-control-dark.png`; toggle theme via `ThemeToggle`; `preview_screenshot` -> `mission-control-light.png`. These are the in-app exemplar every agent matches.

- [ ] **Step 3 (best-effort): Capture LOUD + Raycast**

If the playwright/Chrome MCP is available, navigate to heyradiant.studio's LOUD page and raycast.com, screenshot each into the references dir. If unavailable, skip and note it in the README - do not block Phase 0 on external browsing.

- [ ] **Step 4: Write the references README**

Create `docs/design/references/README.md` describing each file and the borrow / don't-borrow guidance (from project memory):
- `brand-home.jpeg`: the product brand frame - violet/coal palette, mono captions, big sentence headline, Plan/Build/Review/Verify phase bar. Borrow the palette + phase-bar language; it is marketing, not a dashboard layout to copy.
- `mission-control-{dark,light}.png`: the canonical in-app idiom. This is the screen to match.
- LOUD: borrow surface layering + single-hue violet data-viz + rounded cards. Do NOT borrow its finance hero-metric composition.
- Raycast: borrow translucency restraint. 
- Dislikes to avoid: Railway / Vercel / Warp genericism; "AI slop" backgrounds (grids, dot fields, noise, purple gradient mesh).

- [ ] **Step 5: Commit**

```bash
cd /Users/guy/Programming/vibestrate
git add docs/design/references vibestrate-home.jpeg 2>/dev/null
git add -A docs/design/references
git commit -m "docs(design): capture shared reference set for page redesign agents"
```

---

### Task 4: Write the canonical primitives contract

The single file every page agent reads. Codifies Mission Control's idiom as concrete, copy-able recipes + the hard anti-pattern list. Pulls the recipes verbatim from the reference implementation files so it is extraction, not invention.

**Files:**
- Read: `src/ui/components/mission/RunActions.tsx`, `src/ui/components/mission/runPhase.tsx`, `src/ui/app/routes/MissionControlPage.tsx`, `src/ui/components/mission/MissionComposer.tsx`
- Create: `docs/design/primitives-contract.md`
- Modify: `docs/design/design-system-rollout.md` (link to the contract from the Principles/Reference section)

**Interfaces:**
- Consumes: the reference impl files (for verbatim class recipes).
- Produces: `docs/design/primitives-contract.md` - referenced by the per-page agent brief in the spec.

- [ ] **Step 1: Write the contract doc**

Create `docs/design/primitives-contract.md` with these sections, each carrying *actual class strings* lifted from the reference files (no "use appropriate classes" hand-waving):
- **Tokens**: the allowed token names (Global Constraints list above), with the rule "new tokens only".
- **Type scale**: `text-[10px]/[11.5px]/[12.5px]/[13px]`, `font-medium/semibold`; dense, no oversized headings.
- **Rounding**: `rounded-[10px]/[12px]` interactive+cards; `rounded-full` rails/bars only; labels never pill.
- **Button recipe** (verbatim from `RunActions.tsx:61-62`): the `inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition disabled:...` base + intent tints (`text-violet-soft hover:bg-violet-soft/10`, amber pause, rose destructive).
- **Inline status/error** (verbatim from `RunActions.tsx:100`): framed row `w-full rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300`. Rule: state folds into a framed control, never a naked dot+sentence.
- **Icons**: lucide `h-3.5 w-3.5` / `h-4 w-4`, `strokeWidth={1.9}`, `aria-hidden`.
- **Phase/progress**: reuse `mission/runPhase` `PhaseRail` + `statusMessage`; status-driven, playful copy; no scripted timers.
- **Shared primitives to reuse (not re-derive)**: `design/EntityIcon`, `design/ThemeToggle`, `mission/runPhase`, `layout/PanelBoard`, `runs/RunStatusBadge` (existing run-status badge).
- **Anti-patterns (hard no)**: eyebrow kickers / `SectionEyebrow` / `.eyebrow` / uppercase `vibestrate-mono`; pill labels; pulse/breathing on chrome (orb exempt); naked dot+sentence; airy/sparse cards; em dashes; emojis.
- **Retire-on-migration note**: `SectionEyebrow` still has 9 consumers + 27 `.eyebrow` usages on un-migrated pages; each page redesign removes its own eyebrow usage; the file is deleted in Phase 7 cleanup once grep shows zero consumers. Do not bulk-delete now.
- **Theme**: every recipe must work in `:root` (dark) and `:root.light`; verify both.

- [ ] **Step 2: Link the contract from the rollout doc**

In `docs/design/design-system-rollout.md`, under the Principles or Reference-implementations section, add a line pointing to `docs/design/primitives-contract.md` as the canonical idiom every page agent reads.

- [ ] **Step 3: Self-check the doc for placeholders + banned chars**

```bash
cd /Users/guy/Programming/vibestrate
rg -n "TBD|TODO|appropriate|emoji|\xE2\x80\x94" docs/design/primitives-contract.md || echo "clean"
```

Expected: `clean` (no placeholders, no em dash U+2014, no "appropriate" hand-waving).

- [ ] **Step 4: Commit**

```bash
cd /Users/guy/Programming/vibestrate
git add docs/design/primitives-contract.md docs/design/design-system-rollout.md
git commit -m "docs(design): canonical primitives contract (Mission Control idiom)"
```

---

### Task 5: Final branch verification + rollout checklist tick + changelog

Close Phase 0 honestly: green gate, doc status updated, version bumped.

**Files:**
- Modify: `docs/design/design-system-rollout.md` (Status line + `[x] Phase 0` checklist)
- Modify: `CHANGELOG.md`
- Modify: `package.json` (version bump)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a merge-ready Phase 0 branch.

- [ ] **Step 1: Full verify gate**

```bash
cd /Users/guy/Programming/vibestrate
pnpm typecheck && pnpm test && pnpm build
```

Expected: all three PASS. If `pnpm test` fails on something Phase 0 did not touch, report it honestly rather than papering over.

- [ ] **Step 2: Tick the rollout checklist + update Status**

In `docs/design/design-system-rollout.md`: change `- [ ] Phase 0 ...` to `- [x] Phase 0 ...`, and update the `Status:` line to note Phase 0 landed (contract + crosswalk verified + references captured; shadcn set removed).

- [ ] **Step 3: Changelog highlight + version bump**

Add a concise `CHANGELOG.md` entry (foundation contract locked, dead shadcn set removed, crosswalk verified, reference set captured) under a new version heading. Bump:

```bash
cd /Users/guy/Programming/vibestrate
npm version minor --no-git-tag-version
```

- [ ] **Step 4: Commit**

```bash
cd /Users/guy/Programming/vibestrate
git add docs/design/design-system-rollout.md CHANGELOG.md package.json
git commit -m "docs(design): close Phase 0 - foundation contract locked"
```

- [ ] **Step 5: Produce the Phase 0 final report**

Use the repo's final-report format (CLAUDE.md section 4): Summary, Branch/Commits, Files Changed, Commands Run, Test Results, Security Notes, Remaining Limitations (SectionEyebrow + old tokens still live by design), Recommended Next Step (Phase 2 Runs-domain fan-out: first parallel page agents against the locked contract).

---

## Self-Review

**Spec coverage:**
- Reconcile two primitive sets -> Task 1 (delete dead shadcn set; design/ canonical). Covered.
- Verify crosswalk flagged rows -> Task 2. Covered.
- Capture reference set -> Task 3. Covered.
- Write primitives-contract.md -> Task 4. Covered.
- Tiny-primitive extraction -> intentionally deferred (YAGNI; `RunStatusBadge` already exists, un-migrated pages have no clean new-token block to extract from yet); documented in Task 4 "reuse" list. Honest deviation from spec's optional step, noted.
- SectionEyebrow deletion timing -> Task 1 (not deleted) + Task 4 (documented retire-on-migration). Covered.
- Verify gate + checklist + changelog -> Task 5. Covered.

**Placeholder scan:** No "TBD"/"appropriate error handling"/"write tests for the above". Doc-heavy steps name exact section content + verbatim source lines. Task 4 Step 3 actively greps for placeholder words.

**Type consistency:** No new types introduced (Phase 0 is removal + docs). File paths consistent throughout. `RunStatusBadge` referenced by its real path `src/ui/components/runs/RunStatusBadge.tsx` (confirmed to exist in audit).

**Note on TDD shape:** Phase 0 carries no new runtime logic, so tasks verify via grep/typecheck/build rather than unit tests - the honest verification for removal + documentation work. The page-redesign phases that follow carry real UI and get screenshot + build verification per the spec.
