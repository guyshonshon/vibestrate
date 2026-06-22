# Checklist-DAG Shape B - Per-Item Review Panel + Arbiter - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each checklist item its own bounded review panel + arbiter (scoped, non-colliding) with a per-item fix loop that caps run merge-readiness on unresolved findings.

**Architecture:** Reuse the shipped `FlowArbitrationLedger` schema + the frontier's existing `reviewDecision` return, but point arbitration at a per-item file per item. A new builtin flow `pickup-review` extends the per-item band to `micro-plan -> implement -> [review lenses] -> arbiter`. The existing band-frontier call site (`orchestrator.ts:3532-3583`) is wrapped in a per-item loop driven by `gr.reviewDecision`; the run-level arbitration path is untouched.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), Zod schemas, Vitest, the existing orchestrator/flow-runtime modules.

## Global Constraints

- Tests live in `tests/`; run with `pnpm vitest run <file>`. Full gate: `pnpm typecheck && pnpm test && pnpm build`.
- ESM imports use the `.js` suffix even for `.ts` sources.
- No em dashes in any output/code/comments - use a hyphen `-`. No emojis anywhere.
- Pre-publish: break freely, no back-compat shims, no `.catch(()=>default)` swallows. Fail fast. But never auto-delete user data.
- Band turns stay **stateless** this slice (no session reuse). Lens vocabulary is the **closed** `ReviewLens` enum from `src/orchestrator/review-lenses.ts` - no free-form persona injection.
- All file writes go through the run's `ArtifactStore` or the existing path helpers (worktree/run-bounded). No new write/HTTP surface except one read-only token-gated GET.
- Default per-item panel lenses: `["correctness", "risk"]`. Per-item loop bound reuses `resolveLoopMaxIterations` (`flow-resolver.ts:51`).
- Commit per task. Conventional-commit style `feat(...)`/`test(...)`; the repo uses linear ff merges.

---

## File Structure

- `src/utils/paths.ts` - add `runChecklistItemArbitrationPath` beside `runFlowArbitrationPath`.
- `src/flows/runtime/flow-arbitration.ts` - `FlowArbitrationStore` gains an optional explicit-path constructor arg.
- `src/flows/runtime/per-item-verdicts.ts` (new) - pure `collectPerItemVerdicts` aggregator.
- `src/flows/schemas/flow-schema.ts` - optional `checklistReview: { lenses: ReviewLens[] }` field (closed enum).
- `src/flows/runtime/flow-resolver.ts` - resolve the per-item lens set (precedence) onto the snapshot.
- `src/flows/catalog/builtin-flows.ts` - new `pickupReviewFlow`.
- `src/pickup/item-summary.ts` - `ChecklistItemOutcome` gains `reviewVerdict`, `openFindingCount`, `fixIterations`.
- `src/core/orchestrator.ts` - `itemBaseSha` capture in `enterChecklistItem`; per-item band loop + per-item arbitration store at the `3532-3583` seam; `per-item-findings` token; item-scoped review grounding base; outcome verdict fields.
- `src/safety/run-assurance.ts` (+ the merge-readiness computation it reads) - per-item-gaps cap.
- `src/server/routes/runs.ts` - read-only `GET /api/runs/:id/checklist-verdicts`.
- `src/ui/lib/api.ts` + `src/ui/lib/types.ts` + RunTree/Control Center - per-item verdict badge.
- `src/cli/commands/...` (`assurance`, `audit`) - per-item lanes.
- Docs: `docs/design/custom-workflow-dags.md`, `CHANGELOG.md`, `docs/content/`, `package.json` version.

---

## Task 1: Per-item arbitration path + store

**Files:**
- Modify: `src/utils/paths.ts`
- Modify: `src/flows/runtime/flow-arbitration.ts:661-681` (the `FlowArbitrationStore` class)
- Test: `tests/per-item-arbitration-store.test.ts` (new)

**Interfaces:**
- Produces: `runChecklistItemArbitrationPath(projectRoot: string, runId: string, itemIndex: number): string` -> `<run>/artifacts/flows/checklist/item-<itemIndex+1>-arbitration.json`.
- Produces: `new FlowArbitrationStore(projectRoot, runId, filePathOverride?: string)` - when `filePathOverride` is set, `filePath` returns it; `read()`/`write()` behavior otherwise unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// tests/per-item-arbitration-store.test.ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { runChecklistItemArbitrationPath } from "../src/utils/paths.js";
import {
  FlowArbitrationStore,
  createFlowArbitrationLedger,
} from "../src/flows/runtime/flow-arbitration.js";

const SNAP = { flowId: "pickup-review", flowVersion: 1, steps: [] } as any;

describe("per-item arbitration path + store", () => {
  it("path is item-scoped and 1-based", () => {
    const p0 = runChecklistItemArbitrationPath("/proj", "run1", 0);
    const p1 = runChecklistItemArbitrationPath("/proj", "run1", 1);
    expect(p0).toMatch(/flows\/checklist\/item-1-arbitration\.json$/);
    expect(p1).toMatch(/flows\/checklist\/item-2-arbitration\.json$/);
    expect(p0).not.toEqual(p1);
  });

  it("store writes/reads at an explicit per-item path, isolated from the run path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vbs-arb-"));
    const itemPath = runChecklistItemArbitrationPath(root, "run1", 0);
    const store = new FlowArbitrationStore(root, "run1", itemPath);
    expect(store.filePath).toBe(itemPath);
    const runStore = new FlowArbitrationStore(root, "run1");
    expect(runStore.filePath).not.toBe(itemPath);

    const ledger = createFlowArbitrationLedger({ runId: "run1", snapshot: SNAP });
    await store.write(ledger);
    const back = await store.read();
    expect(back?.runId).toBe("run1");
    expect(await runStore.read()).toBeNull(); // run-level path untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/per-item-arbitration-store.test.ts`
Expected: FAIL - `runChecklistItemArbitrationPath` is not exported / `FlowArbitrationStore` ignores the 3rd arg.

- [ ] **Step 3: Add the path helper**

In `src/utils/paths.ts`, beside `runFlowArbitrationPath`, add:

```ts
export function runChecklistItemArbitrationPath(
  projectRoot: string,
  runId: string,
  itemIndex: number,
): string {
  return path.join(
    runArtifactsDir(projectRoot, runId),
    "flows",
    "checklist",
    `item-${itemIndex + 1}-arbitration.json`,
  );
}
```

(Use whatever `runFlowArbitrationPath` uses to reach the artifacts dir - mirror its body; it already imports `path` and the run-dir helper.)

- [ ] **Step 4: Make the store accept an explicit path**

In `src/flows/runtime/flow-arbitration.ts`, change the class:

```ts
export class FlowArbitrationStore {
  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
    private readonly filePathOverride?: string,
  ) {}

  get filePath(): string {
    return this.filePathOverride ?? runFlowArbitrationPath(this.projectRoot, this.runId);
  }
  // read()/write() unchanged
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/per-item-arbitration-store.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 6: Commit**

```bash
git add src/utils/paths.ts src/flows/runtime/flow-arbitration.ts tests/per-item-arbitration-store.test.ts
git commit -m "feat(flows): per-item arbitration path + explicit-path store (Shape B)"
```

---

## Task 2: `collectPerItemVerdicts` aggregator (pure)

**Files:**
- Create: `src/flows/runtime/per-item-verdicts.ts`
- Test: `tests/per-item-verdicts.test.ts` (new)

**Interfaces:**
- Consumes: `runChecklistItemArbitrationPath` (Task 1); `FlowArbitrationLedger` shape.
- Produces:
  ```ts
  export type PerItemVerdict = {
    itemIndex: number;
    verdict: "approved" | "changes_requested" | "none";
    openFindingCount: number;
  };
  export function deriveItemVerdict(ledger: FlowArbitrationLedger | null): PerItemVerdict["verdict"];
  export function openFindingCount(ledger: FlowArbitrationLedger | null): number;
  export async function collectPerItemVerdicts(input: {
    projectRoot: string; runId: string; itemCount: number;
  }): Promise<PerItemVerdict[]>;
  ```

`deriveItemVerdict`: `none` if no ledger or no decision; otherwise map the decision's verdict field to `approved` / `changes_requested`. `openFindingCount`: number of findings with no matching accepted resolution (a finding is "open" unless a resolution with disposition `resolved`/`fixed` exists for its id) - read the resolution disposition vocabulary from `flowFindingResolutionSchema` and treat anything not in the resolved set as open.

- [ ] **Step 1: Write the failing test**

```ts
// tests/per-item-verdicts.test.ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { collectPerItemVerdicts, deriveItemVerdict, openFindingCount } from "../src/flows/runtime/per-item-verdicts.js";
import { runChecklistItemArbitrationPath } from "../src/utils/paths.js";

describe("collectPerItemVerdicts", () => {
  it("deriveItemVerdict returns none for a null ledger", () => {
    expect(deriveItemVerdict(null)).toBe("none");
  });

  it("counts open findings (no resolution = open)", () => {
    const ledger: any = {
      findings: [{ finding: { id: "F1" } }, { finding: { id: "F2" } }],
      resolutions: [{ resolution: { findingId: "F1", disposition: "resolved" } }],
    };
    expect(openFindingCount(ledger)).toBe(1); // F2 still open
  });

  it("collects per-item verdicts across files, missing files -> none", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vbs-piv-"));
    const p0 = runChecklistItemArbitrationPath(root, "run1", 0);
    await mkdir(path.dirname(p0), { recursive: true });
    await writeFile(p0, JSON.stringify({
      schemaVersion: 1, runId: "run1", flowId: "pickup-review", flowVersion: 1,
      createdAt: "t", updatedAt: "t", findings: [], responses: [], resolutions: [],
      decision: { output: { verdict: "APPROVED" }, sourceStepId: "arbiter", sourceArtifactPath: "x" },
      acceptedReviewPassId: null, decisionSummaryPath: null, parseIssues: [],
    }));
    const out = await collectPerItemVerdicts({ projectRoot: root, runId: "run1", itemCount: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ itemIndex: 0, verdict: "approved", openFindingCount: 0 });
    expect(out[1]).toMatchObject({ itemIndex: 1, verdict: "none" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/per-item-verdicts.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement the module**

Create `src/flows/runtime/per-item-verdicts.ts`. Read `flowArbitrationLedgerSchema` and the decision output schema to confirm the verdict field name (the arbiter emits `review-decision`; the decision output has a verdict/disposition string holding `APPROVED`/`CHANGES_REQUESTED`). Implement:

```ts
import { runChecklistItemArbitrationPath } from "../../utils/paths.js";
import { pathExists, readJson } from "../../utils/fs.js"; // match the helpers flow-arbitration uses
import { flowArbitrationLedgerSchema, type FlowArbitrationLedger } from "./flow-arbitration.js";

export type PerItemVerdict = {
  itemIndex: number;
  verdict: "approved" | "changes_requested" | "none";
  openFindingCount: number;
};

const RESOLVED = new Set(["resolved", "fixed", "accepted"]); // confirm against flowFindingResolutionSchema

export function deriveItemVerdict(ledger: FlowArbitrationLedger | null): PerItemVerdict["verdict"] {
  const v = ledger?.decision?.output as { verdict?: string; disposition?: string } | undefined;
  const raw = (v?.verdict ?? v?.disposition ?? "").toUpperCase();
  if (raw === "APPROVED") return "approved";
  if (raw === "CHANGES_REQUESTED") return "changes_requested";
  return "none";
}

export function openFindingCount(ledger: FlowArbitrationLedger | null): number {
  if (!ledger) return 0;
  const resolved = new Set(
    ledger.resolutions
      .filter((r) => RESOLVED.has(String((r.resolution as { disposition?: string }).disposition)))
      .map((r) => (r.resolution as { findingId: string }).findingId),
  );
  return ledger.findings.filter((f) => !resolved.has(f.finding.id)).length;
}

export async function collectPerItemVerdicts(input: {
  projectRoot: string; runId: string; itemCount: number;
}): Promise<PerItemVerdict[]> {
  const out: PerItemVerdict[] = [];
  for (let i = 0; i < input.itemCount; i++) {
    const p = runChecklistItemArbitrationPath(input.projectRoot, input.runId, i);
    let ledger: FlowArbitrationLedger | null = null;
    if (await pathExists(p)) ledger = flowArbitrationLedgerSchema.parse(await readJson(p));
    out.push({ itemIndex: i, verdict: deriveItemVerdict(ledger), openFindingCount: openFindingCount(ledger) });
  }
  return out;
}
```

Adjust the `RESOLVED` set and the verdict field to match the real schemas (read them first; do not guess if a test fails).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/per-item-verdicts.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/flows/runtime/per-item-verdicts.ts tests/per-item-verdicts.test.ts
git commit -m "feat(flows): collectPerItemVerdicts aggregator (Shape B)"
```

---

## Task 3: Flow schema `checklistReview.lenses` + resolution

**Files:**
- Modify: `src/flows/schemas/flow-schema.ts`
- Modify: `src/flows/runtime/flow-resolver.ts` (add a pure `resolveChecklistReviewLenses`)
- Test: `tests/checklist-review-lenses.test.ts` (new)

**Interfaces:**
- Produces: flow definition optional `checklistReview?: { lenses: ReviewLens[] }` (closed `ReviewLens` enum from `src/orchestrator/review-lenses.ts`).
- Produces: `resolveChecklistReviewLenses(o: { flowLenses?: ReviewLens[]; crewLenses?: ReviewLens[] }): ReviewLens[]` - precedence crew > flow > default `["correctness", "risk"]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/checklist-review-lenses.test.ts
import { describe, it, expect } from "vitest";
import { resolveChecklistReviewLenses } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";

describe("checklist review lenses", () => {
  it("defaults to correctness + risk", () => {
    expect(resolveChecklistReviewLenses({})).toEqual(["correctness", "risk"]);
  });
  it("flow overrides default; crew overrides flow", () => {
    expect(resolveChecklistReviewLenses({ flowLenses: ["correctness"] })).toEqual(["correctness"]);
    expect(resolveChecklistReviewLenses({ flowLenses: ["correctness"], crewLenses: ["tests", "risk"] }))
      .toEqual(["tests", "risk"]);
  });
  it("flow schema accepts checklistReview.lenses and rejects an unknown lens", () => {
    const ok = flowDefinitionSchema.safeParse({
      id: "f", version: 1, label: "F", seats: {}, steps: [
        { id: "s", label: "S", kind: "agent-turn", seat: "x", stage: "executing", inputs: [], outputs: ["o"] },
      ],
      checklistReview: { lenses: ["correctness", "risk"] },
    });
    expect(ok.success).toBe(true);
    const bad = flowDefinitionSchema.safeParse({
      id: "f", version: 1, label: "F", seats: {}, steps: [
        { id: "s", label: "S", kind: "agent-turn", seat: "x", stage: "executing", inputs: [], outputs: ["o"] },
      ],
      checklistReview: { lenses: ["made-up-lens"] },
    });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/checklist-review-lenses.test.ts`
Expected: FAIL - `resolveChecklistReviewLenses` not exported; schema lacks the field.

- [ ] **Step 3: Add the schema field**

In `src/flows/schemas/flow-schema.ts`, import the closed lens enum (find the exported `reviewLensSchema`/`ReviewLens` in `src/orchestrator/review-lenses.ts`; if only a TS union exists, build a `z.enum([...REVIEW_LENSES])` from its source array). Add to the flow definition object schema:

```ts
checklistReview: z
  .object({ lenses: z.array(reviewLensSchema).min(1).max(5) })
  .strict()
  .optional(),
```

- [ ] **Step 4: Add the resolver**

In `src/flows/runtime/flow-resolver.ts`:

```ts
import { type ReviewLens } from "../../orchestrator/review-lenses.js";

export const DEFAULT_CHECKLIST_REVIEW_LENSES: ReviewLens[] = ["correctness", "risk"];

export function resolveChecklistReviewLenses(o: {
  flowLenses?: ReviewLens[];
  crewLenses?: ReviewLens[];
}): ReviewLens[] {
  if (o.crewLenses && o.crewLenses.length) return o.crewLenses;
  if (o.flowLenses && o.flowLenses.length) return o.flowLenses;
  return DEFAULT_CHECKLIST_REVIEW_LENSES;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/checklist-review-lenses.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 6: Commit**

```bash
git add src/flows/schemas/flow-schema.ts src/flows/runtime/flow-resolver.ts tests/checklist-review-lenses.test.ts
git commit -m "feat(flows): checklistReview.lenses schema + precedence resolver (Shape B)"
```

---

## Task 4: `pickup-review` builtin flow

**Files:**
- Modify: `src/flows/catalog/builtin-flows.ts` (add `pickupReviewFlow`, register it where `pickupAnalysisFlow` is registered)
- Test: `tests/pickup-review-flow.test.ts` (new)

**Interfaces:**
- Produces: `pickupReviewFlow` - parsed flow; band `micro-plan -> implement -> [review-correctness, review-risk] -> arbiter`; `checklistSegment: { from: "micro-plan", to: "arbiter" }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pickup-review-flow.test.ts
import { describe, it, expect } from "vitest";
import { pickupReviewFlow } from "../src/flows/catalog/builtin-flows.js";

describe("pickup-review builtin", () => {
  it("has a per-item review band ending in an arbiter", () => {
    expect(pickupReviewFlow.id).toBe("pickup-review");
    expect(pickupReviewFlow.checklistSegment).toEqual({ from: "micro-plan", to: "arbiter" });
    const ids = pickupReviewFlow.steps.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["micro-plan", "implement", "review-correctness", "review-risk", "arbiter"]));
  });
  it("reviewers are read-only review-turns; arbiter joins them", () => {
    const arb = pickupReviewFlow.steps.find((s) => s.id === "arbiter")!;
    expect(arb.kind).toBe("review-turn");
    expect(arb.needs).toEqual(expect.arrayContaining(["review-correctness", "review-risk"]));
    const rc = pickupReviewFlow.steps.find((s) => s.id === "review-correctness")!;
    expect(rc.kind).toBe("review-turn");
    expect(rc.needs).toContain("implement");
    expect(rc.continueOnError).toBe(true);
  });
  it("implement accepts an optional per-item-findings input (fix context)", () => {
    const impl = pickupReviewFlow.steps.find((s) => s.id === "implement")!;
    expect(impl.inputs).toContain("per-item-findings");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/pickup-review-flow.test.ts`
Expected: FAIL - `pickupReviewFlow` not exported.

- [ ] **Step 3: Add the flow**

In `src/flows/catalog/builtin-flows.ts`, model on `pickupAnalysisFlow` (line 704) and the panel arbiter (line 497). Add:

```ts
export const pickupReviewFlow = flowDefinitionSchema.parse({
  id: "pickup-review",
  version: 1,
  label: "Pick-up (per-item review)",
  description:
    "Execute a card item-by-item with a per-item REVIEW panel: a holistic plan once, then for each checklist item the implementer writes it and a per-item panel (correctness + risk) plus an arbiter review THAT item's diff; a per-item fix loop runs before the item commits, then a holistic review.",
  seats: {
    planner: { label: "Planner", description: "Plans the card and each item." },
    implementer: { label: "Implementer", description: "Implements (and fixes) one item." },
    reviewer: { label: "Reviewer", description: "Reviews one item under an assigned lens." },
    arbiter: { label: "Arbiter", description: "Renders one per-item verdict." },
  },
  steps: [
    { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", stage: "planning",
      inputs: ["task-brief"], outputs: ["plan"] },
    { id: "micro-plan", label: "Micro-plan item", kind: "agent-turn", seat: "planner", stage: "executing",
      inputs: ["task-brief", "plan", "checklist-item", "prior-items"], outputs: ["micro-plan"] },
    { id: "implement", label: "Implement item", kind: "agent-turn", seat: "implementer", stage: "executing",
      needs: ["micro-plan"],
      // per-item-findings is present only on a fix iteration (>0); absent on iteration 0.
      inputs: ["task-brief", "plan", "micro-plan", "checklist-item", "prior-items", "per-item-findings"],
      outputs: ["execution", "diff"], skipWhenReadOnly: true },
    { id: "review-correctness", label: "Review: correctness", kind: "review-turn", seat: "reviewer", stage: "reviewing",
      needs: ["implement"],
      inputs: ["task-brief", "plan", "micro-plan", "execution", "diff", "checklist-item"],
      outputs: ["findings-correctness"], continueOnError: true,
      instructions: "Your lens is CORRECTNESS & LOGIC for THIS checklist item's diff only. Hunt real bugs: wrong behavior, broken edge cases, races, mishandled errors, contract violations. Cite file:line; no style nits." },
    { id: "review-risk", label: "Review: security & risk", kind: "review-turn", seat: "reviewer", stage: "reviewing",
      needs: ["implement"],
      inputs: ["task-brief", "plan", "micro-plan", "execution", "diff", "checklist-item"],
      outputs: ["findings-risk"], continueOnError: true,
      instructions: "Your lens is SECURITY, RISK & ARCHITECTURE for THIS item's diff only. Injection/secret/path exposure, unsafe effects, broken boundaries, hard-to-revert moves, architectural drift. Flag anything needing sandboxing or human sign-off." },
    { id: "arbiter", label: "Arbiter verdict", kind: "review-turn", seat: "arbiter", stage: "reviewing",
      needs: ["review-correctness", "review-risk"],
      inputs: ["task-brief", "plan", "micro-plan", "execution", "diff", "checklist-item", "findings-correctness", "findings-risk"],
      outputs: ["review-decision"],
      instructions: "You are the arbiter for THIS checklist item. Read both reviewers' findings plus the item diff. De-duplicate, weigh severity, render ONE verdict. APPROVED only if no blocking issue survives; otherwise CHANGES_REQUESTED with the consolidated must-fix list. Cite evidence; do not launder confidence." },
    { id: "review", label: "Holistic review", kind: "review-turn", seat: "reviewer", stage: "reviewing",
      inputs: ["task-brief", "plan", "execution", "prior-items"], outputs: ["findings", "review-decision"] },
  ],
  checklistSegment: { from: "micro-plan", to: "arbiter" },
  checklistReview: { lenses: ["correctness", "risk"] },
  complexity: "high",
  capabilities: {
    taskKinds: ["checklist"],
    strengths: ["multi-step", "checklist", "review", "correctness", "risk"],
    costClass: "high", latencyClass: "high",
    avoids: { readOnly: true },
  },
});
```

Register `pickupReviewFlow` in the same array/exports as `pickupAnalysisFlow` (search the file for where builtins are collected and add it). If the resolver's band read-only grouping rejects a band whose tail is a review-turn, confirm it allows it (Shape A's band tail is `implement`; the panel-review arbiter precedent shows a review-turn join is valid). If a load validation rejects it, that is a real finding - fix the validation to permit a review-turn band tail, do not weaken the flow.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/pickup-review-flow.test.ts`
Expected: PASS (3 assertions). Also run the existing builtin-flows / flow-resolver tests to confirm registration did not break them: `pnpm vitest run tests/ -t "builtin"`.

- [ ] **Step 5: Commit**

```bash
git add src/flows/catalog/builtin-flows.ts tests/pickup-review-flow.test.ts
git commit -m "feat(flows): pickup-review builtin - per-item review band + arbiter (Shape B)"
```

---

## Task 5: Item-base SHA capture + item-scoped review grounding

**Files:**
- Modify: `src/core/orchestrator.ts` (`enterChecklistItem` at `:3354`; the band review grounding base)
- Test: `tests/checklist-item-diff-scope.test.ts` (new) - exercises a small pure helper

**Interfaces:**
- Produces: a pure `itemDiffBase(prevItemSha: string | null, bandEntrySha: string | null): string | null` - returns the SHA reviewers diff against (prev item commit, else band-entry HEAD, else null -> fall back to working diff).

Rationale: keep the SHA-selection logic pure + tested; the orchestrator captures `itemBaseSha` from `revParseHead` at `enterChecklistItem` and threads it into the existing review-grounding diff call as the base.

- [ ] **Step 1: Write the failing test**

```ts
// tests/checklist-item-diff-scope.test.ts
import { describe, it, expect } from "vitest";
import { itemDiffBase } from "../src/core/checklist-diff-scope.js";

describe("itemDiffBase", () => {
  it("uses the band-entry HEAD captured for this item", () => {
    expect(itemDiffBase(null, "abc123")).toBe("abc123");
  });
  it("prefers the prior item's commit when present", () => {
    expect(itemDiffBase("prev999", "abc123")).toBe("prev999");
  });
  it("returns null when no base is known (dry/no-worktree) -> caller uses working diff", () => {
    expect(itemDiffBase(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/checklist-item-diff-scope.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement the pure helper + wire capture**

Create `src/core/checklist-diff-scope.ts`:

```ts
/** The base reviewers diff against for a per-item review band: the prior item's
 *  commit if known, else the HEAD captured at band entry for this item, else null
 *  (caller falls back to the full working diff). */
export function itemDiffBase(prevItemSha: string | null, bandEntrySha: string | null): string | null {
  return prevItemSha ?? bandEntrySha ?? null;
}
```

In `src/core/orchestrator.ts` `enterChecklistItem` (`:3354`), after computing the brief, capture the base into an outer-scope variable the band loop can read:

```ts
// item-scoped review base: HEAD now is the prior item's tip (or band entry for item 0)
itemBaseSha = input.worktreePath ? await revParseHead(input.worktreePath).catch(() => null) : null;
```

Declare `let itemBaseSha: string | null = null;` in the enclosing run scope (near `currentChecklistItemId`). Find the existing review-grounding diff path used by review-turns (search for where the reviewer's diff/grounding is built - the run-level review uses a diff helper); pass `itemBaseSha` as the diff base when the run is in a per-item review band (`bandIsGraph && usingChecklist`). Use `itemDiffBase(prevSha, itemBaseSha)` where `prevSha` is the last committed item's `commitSha` (from `itemOutcomes`), else null. If `revParseHead` does not already exist, add a tiny wrapper over the existing git exec util (search for an existing `git rev-parse HEAD` call - the merge/integration code has one).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/checklist-item-diff-scope.test.ts`
Expected: PASS (3 assertions). Then `pnpm typecheck` to confirm the orchestrator wiring compiles.

- [ ] **Step 5: Commit**

```bash
git add src/core/checklist-diff-scope.ts src/core/orchestrator.ts tests/checklist-item-diff-scope.test.ts
git commit -m "feat(orchestrator): item-scoped review diff base for the per-item band (Shape B)"
```

---

## Task 6: Per-item band loop + per-item arbitration recording (the core)

**Files:**
- Modify: `src/core/orchestrator.ts:3532-3583` (the band-frontier seam)
- Modify: `src/pickup/item-summary.ts:9` (`ChecklistItemOutcome` fields)
- Test: `tests/checklist-shape-b-band.test.ts` (new) - the collision + loop + cap behavior with a fake provider

**Interfaces:**
- Consumes: `FlowArbitrationStore` w/ per-item path (Task 1), `createFlowArbitrationLedger`, the frontier's returned `gr.reviewDecision` (`ReviewDecision`), `resolveLoopMaxIterations` (Task 3 precedence), `collectPerItemVerdicts` (Task 2).
- Produces: `ChecklistItemOutcome` gains `reviewVerdict: "approved" | "changes_requested" | null`, `openFindingCount: number`, `fixIterations: number`. A `flow.checklist.item.review` event per iteration.

- [ ] **Step 1: Extend the outcome type (write the failing test first)**

```ts
// tests/checklist-shape-b-band.test.ts  (start with the type-shape assertion, grow it in step 4)
import { describe, it, expect } from "vitest";
import type { ChecklistItemOutcome } from "../src/pickup/item-summary.js";

describe("ChecklistItemOutcome Shape B fields", () => {
  it("carries per-item review verdict fields", () => {
    const o: ChecklistItemOutcome = {
      itemId: "i1", index: 0, total: 1, text: "t", status: "done",
      commitSha: null, filesTouched: [], summary: "", error: null,
      reviewVerdict: "changes_requested", openFindingCount: 2, fixIterations: 1,
    };
    expect(o.openFindingCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/checklist-shape-b-band.test.ts`
Expected: FAIL - excess-property error on `reviewVerdict`/`openFindingCount`/`fixIterations`.

- [ ] **Step 3: Add the fields**

In `src/pickup/item-summary.ts`, extend the type:

```ts
  error: string | null;
  /** Per-item review band (Shape B). null when the band has no review tail. */
  reviewVerdict?: "approved" | "changes_requested" | null;
  openFindingCount?: number;
  fixIterations?: number;
```

- [ ] **Step 4: Write the band behavior test (failing)**

Model this on the existing `tests/flows/checklist-dag-run.test.ts` (it already drives a checklist-DAG run with a fake provider). Add three cases that run a 2-item `pickup-review` run through the orchestrator with a scripted fake provider:

```ts
// append to tests/checklist-shape-b-band.test.ts - reuse the harness from tests/flows/checklist-dag-run.test.ts
// (import its run helper / fake-provider builder; do not re-invent it).

describe("pickup-review per-item band", () => {
  it("scopes arbitration per item - same finding id on two items does NOT collide", async () => {
    // Fake provider: each item's reviewer emits a finding with id "F1"; arbiter
    // emits CHANGES_REQUESTED on item 0 then APPROVED after a fix; item 1 clean.
    // Assert: item-1-arbitration.json AND item-2-arbitration.json BOTH exist,
    // each with its own "F1", neither overwritten; both per-item decisions survive.
    const { runId, projectRoot } = await runFixtureChecklist("pickup-review", { items: 2, script: TWO_ITEM_F1_SCRIPT });
    const v = await collectPerItemVerdicts({ projectRoot, runId, itemCount: 2 });
    expect(v[0].verdict).toBe("approved");        // resolved after fix
    expect(v[1].verdict).toBeDefined();
    // both ledger files exist and are distinct
    expect(await pathExists(runChecklistItemArbitrationPath(projectRoot, runId, 0))).toBe(true);
    expect(await pathExists(runChecklistItemArbitrationPath(projectRoot, runId, 1))).toBe(true);
  });

  it("runs a bounded fix loop: CHANGES_REQUESTED -> fix -> re-review, fixIterations recorded", async () => {
    const { state } = await runFixtureChecklist("pickup-review", { items: 1, script: FIX_THEN_APPROVE_SCRIPT, maxReviewLoops: 2 });
    const item = state.checklistOutcomes?.[0] ?? /* read from itemOutcomes surface */;
    expect(item.fixIterations).toBeGreaterThanOrEqual(1);
    expect(item.reviewVerdict).toBe("approved");
  });

  it("cap-and-continue: an exhausted item with open findings does NOT abort; run is not merge_ready", async () => {
    const { state, assurance } = await runFixtureChecklist("pickup-review", { items: 2, script: ALWAYS_CHANGES_SCRIPT, maxReviewLoops: 1 });
    // item 0 never resolves; band still reaches item 1 and finishes
    expect(state.checklistProgress?.completed).toBe(2);
    expect(assurance.mergeReady).toBe(false); // capped, not aborted
  });
});
```

Define `TWO_ITEM_F1_SCRIPT`, `FIX_THEN_APPROVE_SCRIPT`, `ALWAYS_CHANGES_SCRIPT` as fake-provider scripts (per-step canned outputs incl. the `review-decision` JSON the arbiter contract expects - copy the marker/JSON shape from the existing arbitration tests). `runFixtureChecklist` wraps the existing checklist-DAG test harness with a flow id + item count + scripted provider + a `maxReviewLoops` config.

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm vitest run tests/checklist-shape-b-band.test.ts`
Expected: FAIL - the band runs once (Shape A behavior), no per-item ledger files, no loop, no cap.

- [ ] **Step 6: Implement the per-item loop at the seam**

Rewrite the `if (bandIsGraph && stepIndex === segFrom) { ... }` block (`orchestrator.ts:3532-3583`). The current body runs the frontier once with the RUN-LEVEL `arbitrationLedger`/`arbitrationStore`, adopts state, and commits. Change it to: when the band has a review tail (the flow declares `checklistReview` or the band's `segTo` is a review-turn arbiter), loop:

```
const isReviewBand = /* snapshot.checklistReview present OR steps[segTo] is the arbiter review-turn */;
if (usingChecklist) await enterChecklistItem(itemIndex);  // captures itemBaseSha (Task 5)
const bandSteps = steps.slice(segFrom, segTo + 1);
let fixIterations = 0;
let lastDecision: ReviewDecision = "BLOCKED";
let itemLedgerPath: string | null = null;
const maxItns = isReviewBand
  ? resolveLoopMaxIterations({ flowMax: snapshot.loop?.maxIterations ?? 2, crewMax, globalCeiling })
  : 1;
for (let itn = 0; itn < maxItns; itn++) {
  // per-item arbitration: fresh ledger + per-item store, ONLY for review bands
  let itemStore = arbitrationStore, itemLedger = arbitrationLedger;
  if (isReviewBand) {
    itemLedgerPath = runChecklistItemArbitrationPath(projectRoot, input.runId, itemIndex);
    itemStore = new FlowArbitrationStore(projectRoot, input.runId, itemLedgerPath);
    itemLedger = createFlowArbitrationLedger({ runId: input.runId, snapshot: input.snapshot });
    await itemStore.write(itemLedger);
  }
  // fix-iteration context: inject open findings from the per-item ledger as `per-item-findings`
  if (isReviewBand && itn > 0) {
    const prev = await itemStore.read();
    outputs.set("per-item-findings", {
      token: "per-item-findings",
      label: "Open findings to fix for this item",
      content: renderOpenFindings(prev),   // small pure renderer over open findings
      artifactPath: undefined,
    });
  } else {
    outputs.delete("per-item-findings");   // iteration 0: no fix context
  }
  let gr;
  try {
    gr = await this.runGraphFrontier({ /* ...same args as today... */,
      arbitrationLedger: itemLedger, arbitrationStore: itemStore });
  } catch (err) { state = await input.stateStore.read().catch(() => state); throw err; }
  state = gr.state;
  planArtifact = gr.planArtifact ?? planArtifact;
  executionArtifact = gr.executionArtifact ?? executionArtifact;
  lastDecision = gr.reviewDecision;
  await input.eventLog.append({ type: "flow.checklist.item.review",
    message: `Item ${itemIndex + 1} review pass ${itn + 1}/${maxItns}: ${lastDecision}.`,
    data: { itemId: checklistItems[itemIndex]!.id, iteration: itn + 1, maxIterations: maxItns, verdict: lastDecision } });
  if (!isReviewBand || lastDecision !== "CHANGES_REQUESTED") break;
  if (itn + 1 < maxItns) fixIterations += 1;   // another fix attempt is coming
}
// stash per-item verdict for commitChecklistItem to fold into the outcome
pendingItemReview = isReviewBand
  ? { verdict: lastDecision === "CHANGES_REQUESTED" ? "changes_requested" : "approved",
      openFindingCount: openFindingCount(await new FlowArbitrationStore(projectRoot, input.runId, itemLedgerPath!).read()),
      fixIterations }
  : null;
if (usingChecklist) {
  const dir = await commitChecklistItem(itemIndex);   // reads pendingItemReview (see below)
  if (dir === "repeat") { itemIndex += 1; await maybeStepModeGate(itemIndex); stepIndex = segFrom; continue; }
}
stepIndex = segTo + 1;
continue;
```

In `commitChecklistItem` (`:3405`), set the new outcome fields from `pendingItemReview` (declare `let pendingItemReview: { verdict; openFindingCount; fixIterations } | null = null;` in run scope):

```ts
const outcome: ChecklistItemOutcome = {
  ...,
  reviewVerdict: pendingItemReview?.verdict ?? null,
  openFindingCount: pendingItemReview?.openFindingCount ?? 0,
  fixIterations: pendingItemReview?.fixIterations ?? 0,
};
```

Add a small pure `renderOpenFindings(ledger)` to `per-item-verdicts.ts` (title + bullet per open finding, byte-capped, redacted via the existing redactor). Resolve `crewMax`/`globalCeiling` the same way the existing run-level loop does (search where `resolveLoopMaxIterations` is already called in `flow-resolver`/orchestrator and reuse those inputs).

KEY INVARIANTS to preserve: (a) the run-level `arbitrationLedger`/`arbitrationStore` are NOT passed to the frontier on a review band (only the per-item ones) - the run-level file stays for the linear postlude; (b) non-review bands (Shape A `pickup-analysis`) take the `maxItns = 1`, run-level-ledger path - byte-identical to today; (c) band turns stay stateless (do not enable session reuse).

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm vitest run tests/checklist-shape-b-band.test.ts`
Expected: PASS. Then run the Shape A regression to prove no behavior change: `pnpm vitest run tests/flows/checklist-dag-run.test.ts`
Expected: PASS unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/core/orchestrator.ts src/pickup/item-summary.ts src/flows/runtime/per-item-verdicts.ts tests/checklist-shape-b-band.test.ts
git commit -m "feat(orchestrator): per-item review loop + per-item arbitration (Shape B core)"
```

---

## Task 7: Merge-readiness cap + assurance per-item-gaps lane

**Files:**
- Modify: `src/safety/run-assurance.ts` (and the merge-readiness computation it consumes - find `computeMergeReady`/`computeMergeReadiness`)
- Test: `tests/per-item-gaps-cap.test.ts` (new)

**Interfaces:**
- Consumes: `collectPerItemVerdicts` / per-item outcomes on run state.
- Produces: a `checklistItemGaps` cap input - when any item has `openFindingCount > 0` (or `reviewVerdict === "changes_requested"`), the run cannot be `merge_ready`; lane = `partially_verified` with a note naming the gapped items.

- [ ] **Step 1: Write the failing test**

```ts
// tests/per-item-gaps-cap.test.ts
import { describe, it, expect } from "vitest";
import { checklistItemGapsCap } from "../src/safety/run-assurance.js";

describe("checklist per-item gaps cap", () => {
  it("caps merge-readiness when any item has open findings", () => {
    const cap = checklistItemGapsCap([
      { itemIndex: 0, verdict: "approved", openFindingCount: 0 },
      { itemIndex: 1, verdict: "changes_requested", openFindingCount: 2 },
    ]);
    expect(cap.caps).toBe(true);
    expect(cap.note).toMatch(/item 2/i);
  });
  it("does not cap when every item is clean", () => {
    const cap = checklistItemGapsCap([{ itemIndex: 0, verdict: "approved", openFindingCount: 0 }]);
    expect(cap.caps).toBe(false);
  });
  it("does not cap a run with no per-item review (empty verdicts)", () => {
    expect(checklistItemGapsCap([]).caps).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/per-item-gaps-cap.test.ts`
Expected: FAIL - `checklistItemGapsCap` not exported.

- [ ] **Step 3: Implement the cap + wire it**

In `src/safety/run-assurance.ts`:

```ts
import type { PerItemVerdict } from "../flows/runtime/per-item-verdicts.js";

export function checklistItemGapsCap(verdicts: PerItemVerdict[]): { caps: boolean; note: string } {
  const gapped = verdicts.filter((v) => v.openFindingCount > 0 || v.verdict === "changes_requested");
  if (gapped.length === 0) return { caps: false, note: "" };
  const items = gapped.map((v) => `item ${v.itemIndex + 1} (${v.openFindingCount} open)`).join(", ");
  return { caps: true, note: `Per-item review left findings open: ${items}. The human reviews the diff before merge.` };
}
```

Wire it into the existing assurance derivation: where the run's lanes/`mergeReady` are computed, if `checklistItemGapsCap(verdicts).caps` then force the verdict to `partially_verified` (never `merge_ready`) and add the note to the assurance `notes` (NOT `caps` if T2 distinguishes - match the existing lane model). The `verdicts` come from `collectPerItemVerdicts` (read in the assurance builder) or from the per-item outcomes already on `state`. Follow whichever the existing assurance builder already has access to.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/per-item-gaps-cap.test.ts`
Expected: PASS (3 assertions). Then `pnpm vitest run tests/checklist-shape-b-band.test.ts` to confirm the cap-and-continue smoke (Task 6) now sees `assurance.mergeReady === false`.

- [ ] **Step 5: Commit**

```bash
git add src/safety/run-assurance.ts tests/per-item-gaps-cap.test.ts
git commit -m "feat(safety): per-item-gaps cap on merge-readiness (Shape B)"
```

---

## Task 8: Surfaces - HTTP read + dashboard verdict + CLI lanes

**Files:**
- Modify: `src/server/routes/runs.ts` (add `GET /api/runs/:id/checklist-verdicts`, token-gated like the other run reads)
- Modify: `src/ui/lib/api.ts`, `src/ui/lib/types.ts`, the RunTree/Control Center item node component
- Modify: `src/cli/commands/` for `vibe assurance` + `vibe audit` per-item lanes
- Test: `tests/server-checklist-verdicts-route.test.ts` (new)

**Interfaces:**
- Produces: `GET /api/runs/:id/checklist-verdicts` -> `{ verdicts: PerItemVerdict[] }`, fail-closed (same auth hook as the other run reads), read-only.

- [ ] **Step 1: Write the failing route test**

```ts
// tests/server-checklist-verdicts-route.test.ts
// Model on the existing run-route tests (search tests/ for a runs route test harness).
import { describe, it, expect } from "vitest";
// build the app the way the existing route tests do, seed a run with 2 per-item ledgers, then:
describe("GET /api/runs/:id/checklist-verdicts", () => {
  it("returns per-item verdicts for a run", async () => {
    // seed item-1/2 arbitration files, then GET the route
    const res = await getJson(`/api/runs/${runId}/checklist-verdicts`);
    expect(res.verdicts).toHaveLength(2);
    expect(res.verdicts[0]).toHaveProperty("verdict");
  });
  it("404s an unknown run", async () => {
    const res = await getRaw(`/api/runs/does-not-exist/checklist-verdicts`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/server-checklist-verdicts-route.test.ts`
Expected: FAIL - route not registered.

- [ ] **Step 3: Implement the route + surfaces**

In `src/server/routes/runs.ts`, add (mirror an existing read-only run route for run-existence + auth):

```ts
app.get<{ Params: { id: string } }>("/api/runs/:id/checklist-verdicts", async (req) => {
  const runId = req.params.id;
  const state = await readRunState(projectRoot, runId);          // existing helper; 404 if absent
  if (!state) throw new HttpError(404, `Run ${runId} not found.`);
  const itemCount = state.checklistProgress?.total ?? 0;
  const verdicts = await collectPerItemVerdicts({ projectRoot, runId, itemCount });
  return { verdicts };
});
```

UI: add `fetchChecklistVerdicts(runId)` to `src/ui/lib/api.ts`, a `PerItemVerdict` type to `types.ts`, and render a per-item verdict badge + `fixIterations` count on the RunTree/Control Center item node (static dot, no pulse; reuse the existing flat chip style). CLI: in `vibe assurance` add a "Per-item review" lane listing gapped items + verdict; in `vibe audit` show per-item findings (read the per-item ledger files). Keep UI<->CLI at parity.

- [ ] **Step 4: Run to verify it passes + typecheck/build**

Run: `pnpm vitest run tests/server-checklist-verdicts-route.test.ts`
Expected: PASS. Then `pnpm typecheck && pnpm build` (UI compiles).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/runs.ts src/ui tests/server-checklist-verdicts-route.test.ts src/cli
git commit -m "feat(ui,cli,api): per-item review verdict surfaces (Shape B, UI<->CLI parity)"
```

---

## Task 9: Docs, changelog, version

**Files:**
- Modify: `docs/design/custom-workflow-dags.md` (move Shape B from "on paper" to shipped; keep the deferred list honest)
- Modify: `docs/content/` (the flow/concept page describing pickup flows - add `pickup-review` + per-item review + cost note)
- Modify: `CHANGELOG.md` (+ `npm version minor --no-git-tag-version`)
- Run: `pnpm docs:generate` (commit the `docs/generated/*.json` diff)

- [ ] **Step 1: Update the design doc**

In `docs/design/custom-workflow-dags.md`, change the "Still on paper: Shape B" line to "SHIPPED (Shape B)" with the version, and update the deferred list to the four items this slice deferred (session reuse, suggestion ingest, extra panels, auto-selection).

- [ ] **Step 2: Update handwritten docs + changelog + version**

Add a `pickup-review` description + the per-item review/cost note to the relevant `docs/content/` page. Bump version and add a CHANGELOG entry:

```bash
npm version minor --no-git-tag-version   # 0.24.1 -> 0.25.0
```

CHANGELOG (top):

```markdown
## 0.25.0

- **Per-item review (checklist Shape B).** The new `pickup-review` flow reviews each checklist item on its own: after the item is written, a configurable panel (correctness + risk by default, persona-aimed) and an arbiter review THAT item's diff, and a bounded per-item fix loop runs before the item commits. Each item gets its own arbitration ledger, so findings and verdicts never collide across items. If an item's fix loop ends with findings still open, the run continues but cannot be marked merge-ready (the gap is surfaced per item) - it never silently passes and never hard-aborts. Session reuse, suggestion ingest, extra panels, and auto-selection are deferred.
```

- [ ] **Step 3: Regenerate the source-aware reference**

Run: `pnpm docs:generate`
Then stage the `docs/generated/*.json` diff.

- [ ] **Step 4: Full verification gate**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add docs CHANGELOG.md package.json
git commit -m "docs(flows): Shape B shipped - pickup-review + per-item review (0.25.0)"
```

---

## Self-Review (done while writing)

- **Spec coverage:** §3.1 -> Task 4; §3.2 -> Task 5; §3.3 -> Tasks 1+2+6; §3.4 -> Task 3; §3.5 -> Tasks 6+7; §3.6 -> Task 8; §7 security (worktree-bound writes, redaction reuse, closed lens enum, fail-closed read) -> Tasks 1/6/8; §8 risks (loop/budget aliasing, base on dry runs) -> Task 6 invariants + Task 5 null-base. Deferred items -> Task 9 doc.
- **Type consistency:** `PerItemVerdict` (Task 2) is consumed unchanged in Tasks 6/7/8; `ChecklistItemOutcome` fields (Task 6) are optional so Task 4's flow and Shape A stay valid; `resolveChecklistReviewLenses` (Task 3) feeds Task 6's `maxItns`/lens resolution; `runChecklistItemArbitrationPath` (Task 1) used identically in Tasks 2/6/8.
- **Open verification points flagged for the implementer (read the real schema, do not guess):** the arbiter decision verdict field name (`verdict` vs `disposition`), the resolution "resolved" disposition vocabulary, the existing review-grounding diff helper's base parameter, and whether the band resolver permits a review-turn `segTo`. Each is called out in its task.

## Post-implementation gate (REQUIRED, per the spec §9)

After Task 9 is green, before any merge: spawn a fresh **Opus 4.8** adversarial reviewer (Tier-2) over the full branch diff. Brief: the per-item loop vs run-level loop budget aliasing, the diff-scope base correctness (does item N's review exclude item N-1?), the merge-readiness cap (can a gapped item ever read merge_ready?), the stateless-fan-out invariant, and the Shape A no-regression claim. Fold blockers before ff-merge to main + push.
