# P6 Board Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the dashboard Board page (`src/ui/app/routes/BoardPage.tsx`) into the flat "slab" design language already adopted by Flows and the marketing site - kill glassmorphism, glow, gradients, and rounded containers - while preserving the board's density and every existing behavior.

**Architecture:** This is a visual restyle of one self-contained route file. There is NO behavior change: column derivation, inline rename, add-task/add-roadmap forms, filtering, KPI counts, suggestions, and 4s polling all stay exactly as they are. The design move is to translate the marketing site's *vocabulary* (square corners, hairline borders, solid flat fills, mono meta strips) onto the existing dense kanban - NOT to port the large `.fcard` catalog card, which would destroy the 5-column density. We reuse the existing `.slab` CSS class, the `Button` design component (already `rounded-none`), and the de-pilled `Chip` component rather than inventing new styles.

**Tech Stack:** React + TypeScript, Tailwind utility classes + a hand-rolled token layer in `src/ui/index.css`, Vite. Verification via `pnpm typecheck` / `pnpm test` / `pnpm build`, a source-token grep gate per task, and a final Playwright screenshot pass for human visual approval.

---

## Design reference (read before starting)

The look we are matching is defined in two places already in the repo:

- **Marketing site** `/Users/guy/Programming/vibestrate-marketing/src/pages/hub.astro` + `src/styles/global.css`. Aesthetic: flat solid-color slabs, hairline (1px, ~0.05-0.14 opacity) dividers, mono meta text, **square corners (border-radius: 0)**, no gradients, no glow, no shadow. Hover = an inset hairline ring or a flat color shift, never a bloom/float.
- **The just-shipped Flows page** `src/ui/app/routes/FlowsPage.tsx` (commit `3e1e2f71`) - the in-repo precedent. It ported the marketing `.fcard`/`.hubp-grid` CSS into `src/ui/index.css`.

**What we reuse (do NOT reinvent):**

- `.slab` (in `src/ui/index.css`): `background: var(--color-ink-100); border: 1px solid var(--line); border-radius: 0;` - the solid flat surface.
- `Button` (`src/ui/components/design/Button.tsx`): already `rounded-none`; variants `primary | secondary | ghost | outline | danger`, sizes `sm | md | lg`.
- `Chip` (`src/ui/components/design/Chip.tsx`): already de-pilled to flat tinted mono text (no bg, no border, no radius); tones `neutral | violet | sky | emerald | amber | rose`.
- Color tokens (already defined in `src/ui/index.css`): `--color-ink-*`, `--color-fog-*`, `--color-violet-soft/mid/deep`, `--color-emerald*`, `--line / --line-strong`. Tailwind utilities `text-fog-*`, `bg-violet-deep`, `border-violet-soft`, etc. all resolve to these.

**What we are deliberately NOT doing (scope guard):**

- NOT scaling the Board title up to the Flows 46px display size. The Board is a dense work surface; its header stays compact. (Flows is a catalog - different job.)
- NOT touching `MissionControlPage.tsx` (a separate page, next in the P6 order).
- NOT changing any data flow, API call, route, or task/roadmap behavior.
- NOT removing the small round status dots (`w-1.5 h-1.5 rounded-full`, `pulse-dot`) - round tiny status indicators are part of the marketing vocabulary too. We only de-round *containers*: cards, columns, chips, inputs, buttons.

**The "forbidden token" gate.** A flat-slab restyle is verified by proving the glassmorphism/glow/gradient signatures are gone from the file. Each task drives a scoped grep to zero. The full-file gate (Task 8) is:

```bash
grep -nE 'backdrop-blur|surface-ink-100-55|card-hover|rounded-(xl|lg|md)|rounded-r-full|linear-gradient|boxShadow: "0 0' src/ui/app/routes/BoardPage.tsx
```

Expected at the end: **no output**. (Note `rounded-full` is intentionally NOT in this gate - tiny status dots keep it. The specific `rounded-full` *pills* are removed by name in their tasks.)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/ui/app/routes/BoardPage.tsx` | The entire Board route (header, KPI strip, roadmap rail, toolbar, columns, task cards, role avatars) | Modify - the only file edited |
| `src/ui/index.css` | Shared tokens + `.slab` + `.fcard` | Read-only reference (no edits expected; all needed classes already exist) |
| `src/ui/components/design/Button.tsx` | Flat button | Reuse (import) |
| `src/ui/components/design/Chip.tsx` | De-pilled chip | Already imported |
| `tests/board-coarse.test.ts`, `tests/roadmap-board.test.ts` | Existing board behavior tests | Must stay green (regression guard) |

All edits land in `BoardPage.tsx`. Each task is one visual region of that file.

---

## Task 0: Branch + baseline

**Files:** none (git + verification only)

- [ ] **Step 1: Confirm clean tree on main and branch off**

```bash
cd /Users/guy/Programming/vibestrate
git status --porcelain   # expect empty
git checkout -b feat/p6-board-slab
```

Expected: new branch `feat/p6-board-slab` created from `main`.

- [ ] **Step 2: Confirm existing board behavior tests pass (regression baseline)**

Run: `pnpm test -- board-coarse roadmap-board seat-board`
Expected: all three suites PASS. (These guard column derivation, archive, and board build - the behavior we must not break.)

- [ ] **Step 3: Capture the baseline forbidden-token count**

Run:

```bash
grep -cE 'backdrop-blur|surface-ink-100-55|card-hover|rounded-(xl|lg|md)|rounded-r-full|linear-gradient|boxShadow: "0 0' src/ui/app/routes/BoardPage.tsx
```

Expected: a non-zero count (this is the "failing test" - the file currently carries glassmorphism/glow/gradient tokens). Note the number; it must reach 0 by Task 8.

---

## Task 1: Columns - slab surface, flat accent, no glow

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (the `<section>` opening in `BoardColumn`, currently ~lines 736-754)

- [ ] **Step 1: Failing check**

Run: `grep -nE 'surface-ink-100-55|backdrop-blur|rounded-xl|rounded-t-xl|linear-gradient|boxShadow: urgent' src/ui/app/routes/BoardPage.tsx`
Expected: matches inside `BoardColumn` (the column shell, top accent bar, and urgent glow).

- [ ] **Step 2: Replace the column shell**

Find this exact block in `BoardColumn`:

```tsx
    <section
      data-column={column.id}
      className={cn(
        "flex flex-col rounded-xl border surface-ink-100-55 backdrop-blur-xl h-full min-h-0",
        urgent ? "border-amber-400/25" : "border-white/[0.06]",
      )}
      style={{
        boxShadow: urgent
          ? "0 0 0 1px rgba(251,191,36,0.08) inset, 0 8px 24px -16px rgba(251,191,36,0.25)"
          : undefined,
      }}
    >
      <div
        className="h-[2px] rounded-t-xl"
        style={{
          background: `linear-gradient(90deg, ${column.accent} 0%, transparent 100%)`,
        }}
      />
```

Replace with:

```tsx
    <section
      data-column={column.id}
      className={cn(
        "flex flex-col slab h-full min-h-0",
        urgent ? "border-amber-400/40" : undefined,
      )}
    >
      <div className="h-[2px]" style={{ background: column.accent }} />
```

Why: `.slab` already supplies the solid `--color-ink-100` fill, a 1px hairline border, and square corners - replacing the translucent `surface-ink-100-55 backdrop-blur-xl rounded-xl` glass shell. The urgent column keeps a solid amber hairline (`border-amber-400/40`) instead of the glow box-shadow. The top accent becomes a flat 2px solid tint (no gradient, no rounded top).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors; `column.accent` is still a `string`).

- [ ] **Step 4: Passing check**

Run: `grep -nE 'surface-ink-100-55|backdrop-blur|rounded-xl|rounded-t-xl' src/ui/app/routes/BoardPage.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "refactor(ui): board columns to flat slab surface (P6)"
```

---

## Task 2: KPI strip - drop the dot glow

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (the dot `<span>` inside `KpiTile`, currently ~lines 521-525)

The `KpiTile` already uses `.slab`, so only the glowing status dot needs flattening.

- [ ] **Step 1: Failing check**

Run: `grep -n 'boxShadow: "0 0 10px currentColor"' src/ui/app/routes/BoardPage.tsx`
Expected: one match (the KPI dot glow).

- [ ] **Step 2: Remove the glow**

Find:

```tsx
        <span
          className={cn("w-1.5 h-1.5 rounded-full", t.dot)}
          style={{ boxShadow: "0 0 10px currentColor" }}
        />
```

Replace with:

```tsx
        <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />
```

Why: the 1.5px dot stays round (status indicator, on-vocabulary) but loses the glow halo.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Passing check**

Run: `grep -n 'boxShadow: "0 0 10px currentColor"' src/ui/app/routes/BoardPage.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "refactor(ui): drop KPI dot glow on board (P6)"
```

---

## Task 3: Task card - square, hairline hover, no glow

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (the card root `<div>` in `TaskCard`, ~lines 896-905; the roadmap accent bar, ~lines 907-915)

- [ ] **Step 1: Failing check**

Run: `grep -nE 'rounded-lg|card-hover|rounded-r-full' src/ui/app/routes/BoardPage.tsx`
Expected: matches in `TaskCard` (the card shell and the roadmap accent bar).

- [ ] **Step 2: Replace the card shell className**

Find:

```tsx
      className={cn(
        "group block w-full text-left rounded-lg border px-2.5 py-2 transition relative card-hover cursor-pointer",
        isWaiting
          ? "border-amber-400/30 bg-amber-500/[0.05]"
          : isFailed
            ? "border-rose-400/25 bg-rose-500/[0.04]"
            : isDone
              ? "border-white/[0.05] bg-white/[0.012] opacity-80"
              : "border-white/[0.07] bg-white/[0.022] hover:bg-white/[0.04]",
      )}
```

Replace with:

```tsx
      className={cn(
        "group block w-full text-left border px-2.5 py-2 transition relative cursor-pointer",
        isWaiting
          ? "border-amber-400/40 bg-amber-500/[0.05]"
          : isFailed
            ? "border-rose-400/40 bg-rose-500/[0.04]"
            : isDone
              ? "border-white/[0.06] bg-white/[0.012] opacity-80"
              : "border-white/[0.07] bg-white/[0.022] hover:border-violet-soft/40 hover:bg-white/[0.04]",
      )}
```

Why: drops `rounded-lg` (square) and `card-hover` (which adds the violet glow box-shadow). Hover now brightens the border to a violet hairline + a subtle fill - a flat shift, matching the marketing card hover.

- [ ] **Step 3: Square the roadmap accent bar**

Find:

```tsx
          className={cn(
            "absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r-full",
            rmSwatch[rmTone],
          )}
```

Replace with:

```tsx
          className={cn(
            "absolute left-0 top-2.5 bottom-2.5 w-[2px]",
            rmSwatch[rmTone],
          )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Passing check**

Run: `grep -nE 'rounded-lg|card-hover|rounded-r-full' src/ui/app/routes/BoardPage.tsx`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "refactor(ui): board task cards to flat square slabs (P6)"
```

---

## Task 4: De-pill priority, status chips, skill tags

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (the `PRIORITY_PILL` constant ~lines 100-104; the priority `<span>` ~lines 918-924; the status `Chip` overrides ~lines 926-957; the skill-tag `<span>` ~lines 1011-1021)

- [ ] **Step 1: Failing check**

Run: `grep -nE 'rounded border px-1|rounded-full border border-white|!rounded !px-1' src/ui/app/routes/BoardPage.tsx`
Expected: matches (priority box, skill-tag pills, chip box overrides).

- [ ] **Step 2: Flatten the priority constant**

Find:

```tsx
const PRIORITY_PILL: Record<Priority, { label: string; cls: string }> = {
  low:    { label: "low",  cls: "border-white/10 text-fog-400 bg-white/[0.025]" },
  medium: { label: "med",  cls: "border-violet-soft/35 text-violet-soft bg-violet-soft/10" },
  high:   { label: "high", cls: "border-amber-400/40 text-amber-300 bg-amber-500/10" },
};
```

Replace with:

```tsx
const PRIORITY_PILL: Record<Priority, { label: string; cls: string }> = {
  low:    { label: "low",  cls: "text-fog-400" },
  medium: { label: "med",  cls: "text-violet-soft" },
  high:   { label: "high", cls: "text-amber-300" },
};
```

- [ ] **Step 3: Flatten the priority span**

Find:

```tsx
        <span
          className={cn(
            "mono text-[9px] uppercase tracking-[0.12em] inline-flex items-center rounded border px-1 py-[1px]",
            prio.cls,
          )}
        >
          {prio.label}
        </span>
```

Replace with:

```tsx
        <span
          className={cn(
            "mono text-[9px] uppercase tracking-[0.12em] inline-flex items-center",
            prio.cls,
          )}
        >
          {prio.label}
        </span>
```

- [ ] **Step 4: Drop the box overrides on the three status chips**

The chips already render via the de-pilled `Chip` component; the `!rounded !px-1 !py-[1px]` overrides add a phantom box around text that no longer has a background. Update all three occurrences (`approval`, `running`, `failed`, and `needs testing` - four `Chip` usages). For each, find the className:

```tsx
            className="!text-[9px] !px-1 !py-[1px] !rounded !uppercase !tracking-[0.12em] !font-normal"
```

Replace with:

```tsx
            className="!text-[9px] !uppercase !tracking-[0.12em] !font-normal"
```

(Use `replace_all` - the string is identical across all four chips.)

- [ ] **Step 5: Flatten the skill tags**

Find:

```tsx
            <span
              key={sid}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.02] px-1.5 py-[1px] text-[9.5px] text-fog-300"
            >
              <ToneDot tone="sky" />
              <span className="truncate max-w-[80px]">{sid}</span>
            </span>
```

Replace with:

```tsx
            <span
              key={sid}
              className="inline-flex items-center gap-1 text-[9.5px] text-fog-300"
            >
              <ToneDot tone="sky" />
              <span className="truncate max-w-[80px]">{sid}</span>
            </span>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Passing check**

Run: `grep -nE 'rounded border px-1|rounded-full border border-white|!rounded !px-1' src/ui/app/routes/BoardPage.tsx`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "refactor(ui): de-pill board priority/status/skill labels to flat mono (P6)"
```

---

## Task 5: Role avatars - solid tone, no gradient

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (the `RoleStack` component, ~lines 1090-1126)

- [ ] **Step 1: Failing check**

Run: `grep -n 'linear-gradient(135deg' src/ui/app/routes/BoardPage.tsx`
Expected: matches (the avatar gradient map).

- [ ] **Step 2: Replace the gradient map with solid tones and square avatars**

Find:

```tsx
  const gradient: Record<ChipTone, string> = {
    neutral: "linear-gradient(135deg,#9aa0b3,#6a7186)",
    violet: "linear-gradient(135deg,#a78bfa,#6951f0)",
    sky: "linear-gradient(135deg,#7cc5ff,#5fa6ff)",
    emerald: "linear-gradient(135deg,#6ee7b7,#10b981)",
    amber: "linear-gradient(135deg,#fcd34d,#f59e0b)",
    rose: "linear-gradient(135deg,#fda4af,#e11d48)",
  };
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((id) => {
        const tone = roleTone(id);
        const initial =
          id.replace(/[^a-zA-Z]/g, "").charAt(0).toUpperCase() || "?";
        return (
          <span
            key={id}
            className="w-4 h-4 rounded ring-2 ring-ink-100 flex items-center justify-center font-serif leading-none text-[9px] text-white"
            style={{ background: gradient[tone] }}
            title={id}
          >
            {initial}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="w-4 h-4 rounded ring-2 ring-ink-100 bg-white/[0.06] flex items-center justify-center text-[8.5px] mono text-fog-300">
          +{extra}
        </span>
      ) : null}
    </div>
  );
```

Replace with:

```tsx
  const solid: Record<ChipTone, string> = {
    neutral: "#6a7186",
    violet: "#6951f0",
    sky: "#5fa6ff",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#e11d48",
  };
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((id) => {
        const tone = roleTone(id);
        const initial =
          id.replace(/[^a-zA-Z]/g, "").charAt(0).toUpperCase() || "?";
        return (
          <span
            key={id}
            className="w-4 h-4 ring-2 ring-ink-100 flex items-center justify-center font-serif leading-none text-[9px] text-white"
            style={{ background: solid[tone] }}
            title={id}
          >
            {initial}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="w-4 h-4 ring-2 ring-ink-100 bg-white/[0.06] flex items-center justify-center text-[8.5px] mono text-fog-300">
          +{extra}
        </span>
      ) : null}
    </div>
  );
```

Why: solid tone fills (no gradient) and square avatars (`rounded` dropped). The `ring-2 ring-ink-100` separation between stacked avatars is kept so the overlap still reads.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Passing check**

Run: `grep -n 'linear-gradient(135deg' src/ui/app/routes/BoardPage.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "refactor(ui): board role avatars to solid tone squares, drop gradients (P6)"
```

---

## Task 6: Roadmap rail chips - square slab, no ring/glow

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (the `RoadmapChip` button, ~lines 604-646)

- [ ] **Step 1: Failing check**

Run: `grep -nE 'rounded-xl border|ring-1 ring-violet-soft|boxShadow: "0 0 8px currentColor"' src/ui/app/routes/BoardPage.tsx`
Expected: matches in `RoadmapChip` (rounded shell, active ring, dot glow).

- [ ] **Step 2: Replace the chip button className**

Find:

```tsx
      className={cn(
        "shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition relative overflow-hidden min-w-[200px]",
        active
          ? "border-violet-soft/45 bg-violet-soft/[0.08] ring-1 ring-violet-soft/30"
          : "border-white/[0.08] bg-white/[0.018] hover:bg-white/[0.035]",
      )}
```

Replace with:

```tsx
      className={cn(
        "shrink-0 border px-3.5 py-2.5 text-left transition relative overflow-hidden min-w-[200px]",
        active
          ? "border-violet-soft/55 bg-violet-deep/20 text-fog-100"
          : "border-white/[0.08] bg-white/[0.018] hover:bg-white/[0.035]",
      )}
```

Why: drops `rounded-xl` (square) and the `ring-1` glow. Active state reads via a solid violet hairline + flat violet fill (echoing the marketing chip's `is-on` violet fill) instead of a ring halo.

- [ ] **Step 3: Remove the dot glow inside the chip**

Find:

```tsx
          <span
            className={cn("w-1.5 h-1.5 rounded-full", swatch[tone])}
            style={{ boxShadow: "0 0 8px currentColor" }}
          />
```

Replace with:

```tsx
          <span className={cn("w-1.5 h-1.5 rounded-full", swatch[tone])} />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Passing check**

Run: `grep -nE 'rounded-xl border|ring-1 ring-violet-soft|boxShadow: "0 0 8px currentColor"' src/ui/app/routes/BoardPage.tsx`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "refactor(ui): board roadmap rail chips to flat square slabs (P6)"
```

---

## Task 7: Header, toolbar, forms - square inputs + reuse Button

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (the header buttons + suggested-next pill ~lines 287-322; the inline forms ~lines 327-377; the toast ~lines 379-392; `BoardToolbar` search + segmented control ~lines 667-712)
- Import: add `Button` from the design components

This task removes the remaining `rounded-md` / `rounded-full` containers in the page chrome and routes the action buttons through the shared `Button` component (DRY + already square). The header type scale stays compact (deliberate - see scope guard).

- [ ] **Step 1: Failing check**

Run: `grep -nE 'rounded-md|rounded-full|rounded text-' src/ui/app/routes/BoardPage.tsx`
Expected: matches (header buttons, suggested-next pill, form inputs, toast, toolbar search + segmented control).

- [ ] **Step 2: Import the Button component**

Find:

```tsx
import { Chip, ToneDot } from "../../components/design/Chip.js";
import type { ChipTone } from "../../components/design/Chip.js";
```

Replace with:

```tsx
import { Chip, ToneDot } from "../../components/design/Chip.js";
import type { ChipTone } from "../../components/design/Chip.js";
import { Button } from "../../components/design/Button.js";
```

- [ ] **Step 3: De-pill the suggested-next button**

Find:

```tsx
                className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-violet-soft/30 bg-violet-mid/15 px-2.5 py-0.5 text-[11px] text-fog-100 hover:bg-violet-mid/25 max-w-[280px]"
```

Replace with:

```tsx
                className="hidden lg:inline-flex items-center gap-1.5 border border-violet-soft/30 bg-violet-mid/15 px-2.5 py-1 text-[11px] text-fog-100 hover:bg-violet-mid/25 max-w-[280px]"
```

- [ ] **Step 4: Replace the two header action buttons with `Button`**

Find:

```tsx
            <button
              type="button"
              onClick={() => {
                setShowRoadmapForm((v) => !v);
                setShowTaskForm(false);
              }}
              className="h-7 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-[11.5px] text-fog-200 hover:bg-white/[0.06]"
            >
              <Plus className="h-3 w-3" strokeWidth={1.7} />
              Roadmap item
            </button>
            <button
              type="button"
              onClick={() => {
                setShowTaskForm((v) => !v);
                setShowRoadmapForm(false);
              }}
              className="h-7 inline-flex items-center gap-1.5 border border-violet-soft/35 bg-violet-deep px-2.5 text-[11.5px] font-medium text-white hover:bg-violet-mid"
            >
              <Plus className="h-3 w-3" strokeWidth={1.7} />
              New task
            </button>
```

Replace with:

```tsx
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowRoadmapForm((v) => !v);
                setShowTaskForm(false);
              }}
              iconLeft={<Plus className="h-3 w-3" strokeWidth={1.7} />}
            >
              Roadmap item
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowTaskForm((v) => !v);
                setShowRoadmapForm(false);
              }}
              iconLeft={<Plus className="h-3 w-3" strokeWidth={1.7} />}
            >
              New task
            </Button>
```

- [ ] **Step 5: Square the roadmap inline form**

Find:

```tsx
            <input
              autoFocus
              value={newRoadmapTitle}
              onChange={(e) => setNewRoadmapTitle(e.target.value)}
              placeholder="Build onboarding flow"
              className="mono flex-1 h-8 rounded-md border border-white/[0.1] bg-white/[0.03] px-2.5 text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/40"
            />
            <button
              type="submit"
              disabled={busy || !newRoadmapTitle.trim()}
              className="h-8 px-3 rounded-md border border-white/10 bg-white/[0.05] text-[11.5px] text-fog-100 hover:bg-white/[0.08] disabled:opacity-50"
            >
              Add
            </button>
```

Replace with:

```tsx
            <input
              autoFocus
              value={newRoadmapTitle}
              onChange={(e) => setNewRoadmapTitle(e.target.value)}
              placeholder="Build onboarding flow"
              className="mono flex-1 h-8 border border-white/[0.1] bg-white/[0.03] px-2.5 text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/40"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={busy || !newRoadmapTitle.trim()}>
              Add
            </Button>
```

- [ ] **Step 6: Square the task inline form**

Find:

```tsx
            <input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Create setup wizard"
              className="mono flex-1 min-w-[240px] h-8 rounded-md border border-white/[0.1] bg-white/[0.03] px-2.5 text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/40"
            />
            <select
              value={newTaskRoadmap}
              onChange={(e) => setNewTaskRoadmap(e.target.value)}
              className="mono h-8 rounded-md border border-white/[0.1] bg-white/[0.03] px-2 text-[11.5px] text-fog-100"
            >
              <option value="">no roadmap link</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !newTaskTitle.trim()}
              className="h-8 px-3 rounded-md border border-white/10 bg-white/[0.05] text-[11.5px] text-fog-100 hover:bg-white/[0.08] disabled:opacity-50"
            >
              Add
            </button>
```

Replace with:

```tsx
            <input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Create setup wizard"
              className="mono flex-1 min-w-[240px] h-8 border border-white/[0.1] bg-white/[0.03] px-2.5 text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/40"
            />
            <select
              value={newTaskRoadmap}
              onChange={(e) => setNewTaskRoadmap(e.target.value)}
              className="mono h-8 border border-white/[0.1] bg-white/[0.03] px-2 text-[11.5px] text-fog-100"
            >
              <option value="">no roadmap link</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm" disabled={busy || !newTaskTitle.trim()}>
              Add
            </Button>
```

- [ ] **Step 7: Square the toast**

Find:

```tsx
            className={cn(
              "mt-3 inline-block rounded-md border px-2.5 py-1 text-[11.5px]",
```

Replace with:

```tsx
            className={cn(
              "mt-3 inline-block border px-2.5 py-1 text-[11.5px]",
```

- [ ] **Step 8: Square the toolbar search input**

Find:

```tsx
          className="w-full h-8 pl-8 pr-3 rounded-md bg-white/[0.025] border border-white/[0.08] text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/35 focus:bg-white/[0.04]"
```

Replace with:

```tsx
          className="w-full h-8 pl-8 pr-3 bg-white/[0.025] border border-white/[0.08] text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/35 focus:bg-white/[0.04]"
```

- [ ] **Step 9: Square the priority segmented control**

Find:

```tsx
      <div className="inline-flex rounded-md border border-white/[0.08] bg-white/[0.025] p-[2px]">
        {priorities.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPriority(p)}
            className={cn(
              "h-[26px] px-2.5 rounded text-[11.5px] font-medium",
              priority === p
                ? "bg-white/[0.08] text-fog-100"
                : "text-fog-400 hover:text-fog-100",
            )}
          >
            {p === "any" ? "Any" : p}
          </button>
        ))}
      </div>
```

Replace with:

```tsx
      <div className="inline-flex border border-white/[0.08] bg-white/[0.025] p-[2px]">
        {priorities.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPriority(p)}
            className={cn(
              "h-[26px] px-2.5 text-[11.5px] font-medium",
              priority === p
                ? "bg-white/[0.08] text-fog-100"
                : "text-fog-400 hover:text-fog-100",
            )}
          >
            {p === "any" ? "Any" : p}
          </button>
        ))}
      </div>
```

- [ ] **Step 10: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 11: Passing check**

Run: `grep -nE 'rounded-md|rounded-full|rounded text-' src/ui/app/routes/BoardPage.tsx`
Expected: no output. (Note: `rounded-full` on the tiny status dots remains and is correct - those are `w-1.5 h-1.5 rounded-full` / `w-1 h-1 rounded-full`; the grep here matched only the now-removed pill/input occurrences. If the dot lines appear, that is expected and acceptable - they are not pills. Confirm by eye that any remaining `rounded-full` is a `w-1` or `w-1.5` dot only.)

Run the disambiguating check:

```bash
grep -nE 'rounded-full' src/ui/app/routes/BoardPage.tsx
```

Expected: only lines where the same element also has `w-1 ` or `w-1.5 ` (status dots). No pill/button/input lines.

- [ ] **Step 12: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "refactor(ui): square board header/toolbar/forms, reuse flat Button (P6)"
```

---

## Task 8: Full verification + visual approval

**Files:** none (verification only)

- [ ] **Step 1: Full forbidden-token gate**

Run:

```bash
grep -nE 'backdrop-blur|surface-ink-100-55|card-hover|rounded-(xl|lg|md)|rounded-r-full|linear-gradient|boxShadow: "0 0' src/ui/app/routes/BoardPage.tsx
```

Expected: **no output** (zero glassmorphism/glow/gradient signatures remain).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Tests (regression)**

Run: `pnpm test`
Expected: PASS (the full suite, including `board-coarse`, `roadmap-board`, `seat-board`). Behavior is unchanged, so all prior counts hold.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS (clean CLI + UI build).

- [ ] **Step 5: Visual approval (the real gate - human eyes)**

Launch the dashboard with the project's `run` skill (or `pnpm dev` for the CLI server + `pnpm dev:ui` for the Vite UI), open the Board route (`#/board`), and:

1. If the board has no tasks, click **New task** and add 2-3 tasks (one with a roadmap link, set varying priorities) so cards render in multiple columns.
2. Using the Playwright MCP tools, navigate to the Board route, then:
   - `browser_take_screenshot` of the full board for the user to approve.
   - `browser_evaluate` to confirm no rendered board element carries a blurred backdrop or a large glow shadow:

```js
() => {
  const root = document.querySelector('[data-column]')?.closest('section')?.parentElement ?? document.body;
  const els = [...root.querySelectorAll('*')];
  const blur = els.filter(e => getComputedStyle(e).backdropFilter !== 'none').length;
  const glow = els.filter(e => {
    const s = getComputedStyle(e).boxShadow;
    return s && s !== 'none' && /\d{2,}px/.test(s); // shadows with >=10px blur/spread
  }).length;
  return { blur, glow };
}
```

   Expected: `{ blur: 0, glow: 0 }` across the board region.
3. Verify by eye against `vibestrate.com/hub`: square cards/columns, hairline dividers, mono meta, flat fills, compact header. Confirm density is preserved (cards did not grow).

- [ ] **Step 6: Update docs + changelog (per CLAUDE.md §10)**

- Tick P6's "Next: Board" in `docs/TODO.md` line ~99 (mark Board done, set the next page - Mission Control).
- Add a `CHANGELOG.md` highlight under a bumped patch version (`npm version patch --no-git-tag-version`): "Board page brought into the flat slab language - square cards/columns, hairline dividers, mono meta, no glassmorphism/glow/gradient; density preserved."

- [ ] **Step 7: Final commit**

```bash
git add docs/TODO.md CHANGELOG.md package.json
git commit -m "docs: tick P6 Board slab pass + changelog"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage** - The "spec" is the design brief "match the marketing site, keep density." Every glassmorphism/glow/gradient/rounded-container signature in `BoardPage.tsx` is addressed: columns (T1), KPI dots (T2), task cards + roadmap accent (T3), priority/status/skill labels (T4), role avatars (T5), roadmap rail (T6), header/toolbar/forms (T7). Final gate (T8) proves none remain. Density-preservation is an explicit scope guard (no title scale-up, cards unchanged in size).

**2. Placeholder scan** - No TBD/TODO/"handle edge cases" steps; every code step shows exact before/after. No "similar to Task N" - each block is repeated in full.

**3. Type consistency** - `PRIORITY_PILL` keeps its `{ label, cls }` shape (T4) so `prio.label`/`prio.cls` still resolve. `RoleStack`'s gradient map is renamed `gradient`->`solid` and every reference (`style={{ background: solid[tone] }}`) is updated in the same block (T5). `Button` is imported (T7 Step 2) before first use (T7 Step 4). `column.accent` stays `string` (T1). `Chip`/`ToneDot` imports untouched.

**Known residual judgment calls (flagged for the implementer, not blockers):**
- Column-header labels keep `uppercase tracking-[0.14em]` mono - these are data/column identity labels, not page-name eyebrow slugs, so they're left as-is. If they read too "shouty" next to the new flat surfaces, soften tracking to match the readable `.eyebrow` (0.01em) - a one-line call to make with eyes on the screen.
- The stale `// Mission Control v3 board` comment at the top of the file is left untouched (accurate enough; out of restyle scope).
