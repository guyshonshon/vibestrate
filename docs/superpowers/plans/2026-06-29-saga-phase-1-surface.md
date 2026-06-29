# Saga Phase 1 (Surface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Saga" task kind real and authorable - a `Task` with `kind: "saga"` holding enriched steps - with CLI, HTTP, and dashboard surfaces. No execution engine (that is Phase 2).

**Architecture:** A Saga is a `Task` with `kind: "saga"`; its Steps are the existing `checklist[]` items, enriched with `objective` / `acceptanceCheck` / `fileHints`. We extend the existing roadmap types, service, task routes, CLI, and board/detail UI - we do not fork a parallel "saga" data model or API. Every new zod field carries a `.default()`, so tasks written before Saga upgrade losslessly on read.

**Tech Stack:** TypeScript, zod (schemas), commander (CLI), fastify (HTTP), React (dashboard), vitest (tests). Test files live flat in `tests/*.test.ts`; `pnpm test` runs `vitest run`; single file: `pnpm exec vitest run tests/<file>.test.ts`.

## Global Constraints

- **Every new zod field MUST have `.default()`.** `getTask` parses via `taskSchema.parse()` and its `catch { return null }` would silently drop any task that throws. A new field without a default makes every pre-Saga task on disk throw and vanish. (`src/roadmap/roadmap-store.ts:100-111`)
- **Pre-publish, single-user:** no back-compat shims, no aliases, fail fast on bad input - but never silently drop or auto-delete data.
- **House style:** no em dashes (use a hyphen `-`), no emojis anywhere (code, output, commits), "Provider" not "Engine".
- **UI:** compose only from `src/ui/components/design/*` (`Button`, `Select`, `StatTile`, `Chip`, `ToneDot`); never bare `<button>`. No rounded pill labels, no faint uppercase eyebrow slugs, no `chalk-400`/`fog-400` for primary labels (labels carry violet or category color), no pulse/breathing animation. Cards stay dense. Per `docs/design/primitives-contract.md`.
- **Verification gates:** `pnpm typecheck`, `pnpm test`, `pnpm build` must pass before the phase is done.
- **Scope:** Phase 1 adds only `Task.kind` and step fields `objective`/`acceptanceCheck`/`fileHints`. `sagaState`, `dependsOn`, `runId`, `outcomeSummary` are deferred to Phase 2 (free to add later via the same zod-default upgrade).

## File Structure

- Modify `src/roadmap/roadmap-types.ts` - add `taskKindSchema`/`TaskKind`, `Task.kind`, enrich `checklistItemSchema`, add `Step` alias. (Task 1)
- Modify `src/roadmap/roadmap-service.ts` - `AddTaskInput.kind`, `addTask` sets kind, `ChecklistItemPatch` + `addChecklistItem` take enriched fields. (Task 2)
- Create `src/cli/commands/saga.ts` + modify `src/cli/index.ts` - `vibe saga` group. (Task 3)
- Modify `src/server/routes/tasks.ts` - `kind` on create, enriched fields on checklist add/patch. (Task 4)
- Modify `src/ui/lib/api.ts` - client pass-through for kind + enriched fields. (Task 5)
- Modify `src/ui/app/routes/BoardPage.tsx` - `SagaCard` container + kind branch. (Task 6)
- Modify `src/ui/app/routes/TaskDetailPage.tsx` - step editor authors enriched fields for sagas. (Task 7)
- Create tests: `tests/saga-schema.test.ts`, `tests/saga-service.test.ts`, `tests/cli-saga.test.ts`, `tests/server-saga.test.ts`.

---

### Task 1: Schema - kind + enriched step fields

**Files:**
- Modify: `src/roadmap/roadmap-types.ts` (checklistItemSchema ~131-140; taskSchema ~142-210)
- Test: `tests/saga-schema.test.ts`

**Interfaces:**
- Produces: `taskKindSchema` (`z.enum(["single","saga"])`), `TaskKind`, `Task.kind: TaskKind`, `ChecklistItem.objective: string`, `.acceptanceCheck: string`, `.fileHints: string[]`, `export type Step = ChecklistItem`.

- [ ] **Step 1: Write the failing test**

Create `tests/saga-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { taskSchema, checklistItemSchema } from "../src/roadmap/roadmap-types.js";

describe("saga schema (zod-default migration)", () => {
  it("upgrades a pre-Saga checklist item losslessly", () => {
    const old = {
      id: "ci-1",
      text: "do the thing",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      commitSha: "abc1234",
      promotedTaskId: null,
    };
    const item = checklistItemSchema.parse(old);
    expect(item.text).toBe("do the thing");
    expect(item.commitSha).toBe("abc1234");
    expect(item.objective).toBe("");
    expect(item.acceptanceCheck).toBe("");
    expect(item.fileHints).toEqual([]);
  });

  it("defaults task.kind to single for pre-Saga tasks", () => {
    const task = taskSchema.parse({
      id: "task-1",
      title: "old task",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(task.kind).toBe("single");
  });

  it("round-trips a saga task with enriched steps", () => {
    const saga = taskSchema.parse({
      id: "task-saga",
      title: "build feature",
      kind: "saga",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      checklist: [{
        id: "ci-a",
        text: "step a",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        objective: "make a",
        acceptanceCheck: "a works",
        fileHints: ["src/a.ts"],
      }],
    });
    const round = taskSchema.parse(JSON.parse(JSON.stringify(saga)));
    expect(round.kind).toBe("saga");
    expect(round.checklist[0]?.objective).toBe("make a");
    expect(round.checklist[0]?.fileHints).toEqual(["src/a.ts"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/saga-schema.test.ts`
Expected: FAIL - `item.objective` is `undefined` / `task.kind` is `undefined` (fields not in schema yet).

- [ ] **Step 3: Enrich `checklistItemSchema`**

In `src/roadmap/roadmap-types.ts`, replace the `checklistItemSchema` object (lines ~131-139) by adding three fields before the closing `})`:
```ts
export const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: checklistItemStatusSchema.default("pending"),
  createdAt: z.string(),
  updatedAt: z.string(),
  commitSha: z.string().nullable().default(null),
  promotedTaskId: safeIdSchema.nullable().default(null),
  // Saga step fields (Phase 1): a checklist item IS a Saga "step". Defaulted so
  // pre-Saga tasks upgrade losslessly on read (getTask never sees a throw).
  objective: z.string().default(""),
  acceptanceCheck: z.string().default(""),
  fileHints: z.array(z.string()).default([]),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Step = ChecklistItem;
```

- [ ] **Step 4: Add `taskKindSchema` and `Task.kind`**

In `src/roadmap/roadmap-types.ts`, immediately above `export const taskSchema = z.object({`:
```ts
export const taskKindSchema = z.enum(["single", "saga"]);
export type TaskKind = z.infer<typeof taskKindSchema>;
```
Then inside `taskSchema`, add `kind` right after the `id:` line:
```ts
  id: safeIdSchema,
  kind: taskKindSchema.default("single"),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/saga-schema.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Commit**

```bash
git add src/roadmap/roadmap-types.ts tests/saga-schema.test.ts
git commit -m "feat(saga): add task kind + enriched step fields to schema"
```

---

### Task 2: Service - create sagas, author enriched steps

**Files:**
- Modify: `src/roadmap/roadmap-service.ts` (AddTaskInput ~49-65; ChecklistItemPatch ~73-75; addTask ~143-204; addChecklistItem ~542-563)
- Test: `tests/saga-service.test.ts`

**Interfaces:**
- Consumes: `Task`, `ChecklistItem`, `TaskKind` from Task 1.
- Produces: `addTask({..., kind?: TaskKind})` persists `kind`; `addChecklistItem(taskId, text, fields?: { objective?: string; acceptanceCheck?: string; fileHints?: string[] })`; `ChecklistItemPatch` gains `objective` / `acceptanceCheck` / `fileHints`.

- [ ] **Step 1: Write the failing test**

Create `tests/saga-service.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

async function tmpProject() {
  const dir = await mkdtemp(path.join(tmpdir(), "vibe-saga-"));
  const svc = new RoadmapService(dir);
  await svc.init();
  return { dir, svc };
}

describe("RoadmapService - saga authoring", () => {
  it("creates a task with kind=saga and reloads it", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Build dashboards", kind: "saga" });
      expect(task.kind).toBe("saga");
      expect((await svc.getTask(task.id))?.kind).toBe("saga");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults kind to single when omitted", async () => {
    const { dir, svc } = await tmpProject();
    try {
      expect((await svc.addTask({ title: "One-off" })).kind).toBe("single");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adds a step with objective, acceptance, trimmed file hints", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Feature", kind: "saga" });
      const { item } = await svc.addChecklistItem(task.id, "Wire the route", {
        objective: "Expose POST /api/x",
        acceptanceCheck: "curl returns 200",
        fileHints: ["src/server/routes/x.ts", "  "],
      });
      expect(item.objective).toBe("Expose POST /api/x");
      expect(item.acceptanceCheck).toBe("curl returns 200");
      expect(item.fileHints).toEqual(["src/server/routes/x.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches a step's objective via updateChecklistItem", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Feature", kind: "saga" });
      const { item } = await svc.addChecklistItem(task.id, "Step");
      const res = await svc.updateChecklistItem(task.id, item.id, { objective: "refined goal" });
      expect(res.item.objective).toBe("refined goal");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/saga-service.test.ts`
Expected: FAIL - `addTask` rejects unknown `kind` key at the type level / `item.objective` is `undefined`.

- [ ] **Step 3: Extend `AddTaskInput` and `ChecklistItemPatch`**

In `src/roadmap/roadmap-service.ts`, add the import (if `TaskKind` is not already imported from `roadmap-types.js`) and the field. At `AddTaskInput` (~49-65), add before the closing `};`:
```ts
  kind?: TaskKind;
```
Update the type import at the top of the file to include `TaskKind` (it imports from `./roadmap-types.js`).

Replace `ChecklistItemPatch` (~73-75):
```ts
export type ChecklistItemPatch = Partial<
  Pick<
    ChecklistItem,
    "text" | "status" | "commitSha" | "promotedTaskId" | "objective" | "acceptanceCheck" | "fileHints"
  >
>;
```

- [ ] **Step 4: Set `kind` in `addTask` and accept fields in `addChecklistItem`**

In `addTask` (~143-204), in the `const task: Task = {` literal, add after `id: makeId(input.title, "task"),`:
```ts
    kind: input.kind ?? "single",
```

Replace `addChecklistItem` (~542-563):
```ts
async addChecklistItem(
  taskId: string,
  text: string,
  fields: { objective?: string; acceptanceCheck?: string; fileHints?: string[] } = {},
): Promise<{ task: Task; item: ChecklistItem }> {
  const t = await this.requireTask(taskId);
  const trimmed = text.trim();
  if (!trimmed) {
    throw new RoadmapServiceError("Checklist item text is required.");
  }
  const ts = nowIso();
  const item: ChecklistItem = {
    id: makeId(trimmed, "ci"),
    text: trimmed,
    status: "pending",
    createdAt: ts,
    updatedAt: ts,
    commitSha: null,
    promotedTaskId: null,
    objective: fields.objective?.trim() ?? "",
    acceptanceCheck: fields.acceptanceCheck?.trim() ?? "",
    fileHints: (fields.fileHints ?? []).map((f) => f.trim()).filter((f) => f.length > 0),
  };
  const task = await this.writeChecklist(t, [...t.checklist, item]);
  return { task, item };
}
```
(`updateChecklistItem` needs no body change: its `{ ...prev, ...patch, ... }` spread now carries the new patch keys.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/saga-service.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 6: Commit**

```bash
git add src/roadmap/roadmap-service.ts tests/saga-service.test.ts
git commit -m "feat(saga): service support for saga kind + enriched step authoring"
```

---

### Task 3: CLI - `vibe saga` command group

**Files:**
- Create: `src/cli/commands/saga.ts`
- Modify: `src/cli/index.ts` (imports ~28-29; `program.addCommand(...)` block ~163-164)
- Test: `tests/cli-saga.test.ts`

**Interfaces:**
- Consumes: `RoadmapService` (Task 2).
- Produces: `export function buildSagaCommand(): Command` with subcommands `create`, `add-step`, `list`, `show`.

- [ ] **Step 1: Write the failing test**

Create `tests/cli-saga.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSagaCommand } from "../src/cli/commands/saga.js";

describe("vibe saga command wiring", () => {
  it("registers create, add-step, list, show", () => {
    const names = buildSagaCommand().commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(["create", "add-step", "list", "show"]));
  });

  it("create accepts --description and --json", () => {
    const create = buildSagaCommand().commands.find((c) => c.name() === "create");
    expect(create?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--description", "--json"]),
    );
  });

  it("add-step accepts --objective, --acceptance, --files", () => {
    const addStep = buildSagaCommand().commands.find((c) => c.name() === "add-step");
    expect(addStep?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--objective", "--acceptance", "--files"]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cli-saga.test.ts`
Expected: FAIL - cannot find module `../src/cli/commands/saga.js`.

- [ ] **Step 3: Create `src/cli/commands/saga.ts`**

Copy the import header + `svc()` helper verbatim from the top of `src/cli/commands/roadmap.ts` (lines 1-13: `Command`, `detectProject`, `RoadmapService`, `color`/`symbol`/`indent`, `isVibestrateError`). Then:
```ts
async function cmdCreate(
  title: string,
  opts: { description?: string; json?: boolean },
): Promise<number> {
  try {
    const s = await svc();
    await s.init();
    const task = await s.addTask({ title, description: opts.description, kind: "saga" });
    if (opts.json) { console.log(JSON.stringify(task, null, 2)); return 0; }
    console.log(`${symbol.ok()} Saga created.`);
    console.log(indent(`id: ${color.bold(task.id)}`));
    console.log(indent(`title: ${task.title}`));
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdAddStep(
  taskId: string,
  text: string,
  opts: { objective?: string; acceptance?: string; files?: string; json?: boolean },
): Promise<number> {
  try {
    const s = await svc();
    const { item } = await s.addChecklistItem(taskId, text, {
      objective: opts.objective,
      acceptanceCheck: opts.acceptance,
      fileHints: opts.files ? opts.files.split(",").map((f) => f.trim()).filter(Boolean) : [],
    });
    if (opts.json) { console.log(JSON.stringify(item, null, 2)); return 0; }
    console.log(`${symbol.ok()} Step added to ${color.bold(taskId)}.`);
    console.log(indent(`id: ${item.id}`));
    console.log(indent(`text: ${item.text}`));
    if (item.objective) console.log(indent(`objective: ${item.objective}`));
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdList(opts: { json?: boolean }): Promise<number> {
  try {
    const s = await svc();
    const sagas = (await s.listTasks()).filter((t) => t.kind === "saga");
    if (opts.json) { console.log(JSON.stringify(sagas, null, 2)); return 0; }
    if (sagas.length === 0) {
      console.log("No sagas yet. Create one with `vibe saga create <title>`.");
      return 0;
    }
    for (const t of sagas) {
      const done = t.checklist.filter((c) => c.status === "done").length;
      console.log(`${color.bold(t.id)}  ${t.title}  [${done}/${t.checklist.length} steps]`);
    }
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdShow(id: string, opts: { json?: boolean }): Promise<number> {
  try {
    const s = await svc();
    const task = await s.getTask(id);
    if (!task) { console.error(`${symbol.fail()} Saga "${id}" not found.`); return 1; }
    if (opts.json) { console.log(JSON.stringify(task, null, 2)); return 0; }
    console.log(`${color.bold(task.title)}  (${task.kind})`);
    if (task.description) console.log(indent(task.description));
    console.log(indent(`steps: ${task.checklist.length}`));
    task.checklist.forEach((c, i) => {
      console.log(indent(`${i + 1}. [${c.status}] ${c.text}`));
      if (c.objective) console.log(indent(`     objective: ${c.objective}`));
      if (c.acceptanceCheck) console.log(indent(`     accept: ${c.acceptanceCheck}`));
      if (c.fileHints.length) console.log(indent(`     files: ${c.fileHints.join(", ")}`));
    });
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

export function buildSagaCommand(): Command {
  const cmd = new Command("saga").description(
    "Author multi-step Saga tasks (kind=saga): one feature, coordinated steps.",
  );
  cmd
    .command("create <title>")
    .description("Create a new Saga task.")
    .option("-d, --description <text>", "longer description")
    .option("--json", "emit JSON")
    .action(async (title: string, opts) => process.exit(await cmdCreate(title, opts)));
  cmd
    .command("add-step <taskId> <text>")
    .description("Add a step to a Saga.")
    .option("--objective <text>", "the step's scoped goal")
    .option("--acceptance <text>", "done-when check for the step")
    .option("--files <list>", "comma-separated file hints")
    .option("--json", "emit JSON")
    .action(async (taskId: string, text: string, opts) =>
      process.exit(await cmdAddStep(taskId, text, opts)),
    );
  cmd
    .command("list")
    .description("List Saga tasks.")
    .option("--json", "emit JSON")
    .action(async (opts) => process.exit(await cmdList(opts)));
  cmd
    .command("show <id>")
    .description("Show a Saga and its steps.")
    .option("--json", "emit JSON")
    .action(async (id: string, opts) => process.exit(await cmdShow(id, opts)));
  return cmd;
}
```

- [ ] **Step 4: Register the command in `src/cli/index.ts`**

Add with the other command imports (near line 28-29):
```ts
import { buildSagaCommand } from "./commands/saga.js";
```
Add with the other `program.addCommand(...)` calls (near line 163-164):
```ts
program.addCommand(buildSagaCommand());
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm exec vitest run tests/cli-saga.test.ts`
Expected: PASS (3 passing).
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/saga.ts src/cli/index.ts tests/cli-saga.test.ts
git commit -m "feat(saga): vibe saga CLI group (create, add-step, list, show)"
```

---

### Task 4: HTTP routes - kind on create, enriched fields on checklist

**Files:**
- Modify: `src/server/routes/tasks.ts` (addBody ~11-23; checklistAddBody ~33; checklistPatchBody ~34-41; their handlers ~105-117, 210-226, 228-245)
- Test: `tests/server-saga.test.ts`

**Interfaces:**
- Consumes: service methods from Task 2.
- Produces: `POST /api/tasks` accepts `kind`; `POST /api/tasks/:taskId/checklist` accepts `objective`/`acceptanceCheck`/`fileHints`; `PATCH .../checklist/:itemId` accepts the same.

- [ ] **Step 1: Write the failing test**

Create `tests/server-saga.test.ts`. Mirror the app-build + temp-project harness from `tests/server-roadmap.test.ts` (same imports and `beforeAll`/`afterAll` setup that yields a fastify `app` bound to a temp project root), then add:
```ts
  it("creates a saga task via POST /api/tasks", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "Feature X", kind: "saga" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().task.kind).toBe("saga");
  });

  it("adds a step with objective", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "F", kind: "saga" },
    });
    const taskId = created.json().task.id;
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/checklist`,
      payload: { text: "step", objective: "do x", fileHints: ["src/x.ts"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.objective).toBe("do x");
    expect(res.json().item.fileHints).toEqual(["src/x.ts"]);
  });

  it("patches a step acceptanceCheck", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "F", kind: "saga" },
    });
    const taskId = created.json().task.id;
    const added = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/checklist`,
      payload: { text: "step" },
    });
    const itemId = added.json().item.id;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}/checklist/${itemId}`,
      payload: { acceptanceCheck: "passes" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.acceptanceCheck).toBe("passes");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/server-saga.test.ts`
Expected: FAIL - `task.kind` is `"single"` (kind ignored) / `item.objective` is `""` (field stripped by body schema).

- [ ] **Step 3: Extend the request body schemas**

In `src/server/routes/tasks.ts`, add to `addBody` (~11-23), before its closing `});`:
```ts
  kind: z.enum(["single", "saga"]).optional(),
```
Replace `checklistAddBody` (~33):
```ts
const checklistAddBody = z.object({
  text: z.string().min(1),
  objective: z.string().optional(),
  acceptanceCheck: z.string().optional(),
  fileHints: z.array(z.string()).optional(),
});
```
Replace `checklistPatchBody` (~34-41):
```ts
const checklistPatchBody = z
  .object({
    text: z.string().min(1).optional(),
    status: z.enum(["pending", "in_progress", "done", "blocked"]).optional(),
    objective: z.string().optional(),
    acceptanceCheck: z.string().optional(),
    fileHints: z.array(z.string()).optional(),
  })
  .refine(
    (b) =>
      b.text !== undefined ||
      b.status !== undefined ||
      b.objective !== undefined ||
      b.acceptanceCheck !== undefined ||
      b.fileHints !== undefined,
    { message: "Provide at least one of: text, status, objective, acceptanceCheck, fileHints." },
  );
```

- [ ] **Step 4: Pass the new fields through the handlers**

In the `POST /api/tasks` handler (~105-117), `svc.addTask(parsed.data)` already forwards `kind` (now a known `AddTaskInput` key) - no change needed beyond Step 3.

In the `POST /api/tasks/:taskId/checklist` handler (~210-226), change the service call:
```ts
        const { task, item } = await svc.addChecklistItem(
          req.params.taskId,
          parsed.data.text,
          {
            objective: parsed.data.objective,
            acceptanceCheck: parsed.data.acceptanceCheck,
            fileHints: parsed.data.fileHints,
          },
        );
```
The `PATCH .../checklist/:itemId` handler (~228-245) already passes `parsed.data` to `updateChecklistItem`, whose `ChecklistItemPatch` now accepts the new keys - no change needed beyond Step 3.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/server-saga.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/tasks.ts tests/server-saga.test.ts
git commit -m "feat(saga): task routes accept kind + enriched step fields"
```

---

### Task 5: API client pass-through

**Files:**
- Modify: `src/ui/lib/api.ts` (`addTask` input type; `addChecklistItem`; `updateChecklistItem` patch type)

**Interfaces:**
- Consumes: routes from Task 4.
- Produces: client methods that forward `kind` and the enriched step fields. Later UI tasks call these.

- [ ] **Step 1: Extend `addTask` input**

In `src/ui/lib/api.ts`, add `kind?: "single" | "saga";` to the `addTask` input object type, and ensure the request body forwards it (it spreads/forwards `input`, so confirm `kind` is included in the JSON payload).

- [ ] **Step 2: Extend `addChecklistItem`**

Change the signature to:
```ts
async addChecklistItem(
  taskId: string,
  text: string,
  fields?: { objective?: string; acceptanceCheck?: string; fileHints?: string[] },
): Promise<{ task: Task; item: ChecklistItem }>
```
and include `...fields` in the POST body alongside `text`.

- [ ] **Step 3: Extend `updateChecklistItem` patch type**

Add `objective?: string; acceptanceCheck?: string; fileHints?: string[]` to the `patch` parameter type, and forward them in the PATCH body.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (UI tsconfig included).

- [ ] **Step 5: Commit**

```bash
git add src/ui/lib/api.ts
git commit -m "feat(saga): api client forwards kind + enriched step fields"
```

---

### Task 6: Board - compact Saga container card

**Files:**
- Modify: `src/ui/app/routes/BoardPage.tsx` (task list render ~813-823; add `SagaCard` near `TaskCard` ~834)

**Interfaces:**
- Consumes: `Task.kind`, `Task.checklist`.
- Produces: a `SagaCard` rendered when `task.kind === "saga"`, lighter than `TaskCard`, showing a step progress strip.

UI verification per house norms: typecheck + build + browser check (not forced TDD).

- [ ] **Step 1: Add `SagaCard`**

In `src/ui/app/routes/BoardPage.tsx`, add a `SagaCard` component near `TaskCard`. Compose from existing primitives; keep it denser/lighter than `TaskCard` (no roles row, no priority chip - just a saga marker, title, and a step progress strip):
```tsx
function SagaCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (taskId: string) => void;
}) {
  const total = task.checklist.length;
  const done = task.checklist.filter((c) => c.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      data-task-id={task.id}
      className="group block w-full cursor-pointer border border-violet-soft/25 bg-violet-500/[0.04] px-2.5 py-2 transition hover:border-violet-soft/50 hover:bg-violet-500/[0.07]"
    >
      <div className="flex items-center gap-1.5">
        <Layers className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
        <span className="mono text-[9px] uppercase tracking-[0.12em] text-violet-soft">saga</span>
        <span className="ml-auto mono text-[9.5px] text-chalk-300 num-tabular">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1.5 text-[12px] font-medium leading-snug text-chalk-100 break-words line-clamp-2">
        {task.title}
      </div>
      <div className="mt-2 flex items-center gap-1" aria-label={`${done} of ${total} steps done`}>
        {total === 0 ? (
          <span className="mono text-[9.5px] text-chalk-300">no steps yet</span>
        ) : (
          task.checklist.map((c) => (
            <span
              key={c.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                c.status === "done"
                  ? "bg-violet-soft"
                  : c.status === "in_progress"
                    ? "bg-violet-soft/50"
                    : "bg-white/10",
              )}
            />
          ))
        )}
      </div>
      {total > 0 ? (
        <div className="mt-1 mono text-[9px] text-chalk-300 num-tabular">{pct}%</div>
      ) : null}
    </div>
  );
}
```
Import `Layers` from `lucide-react` alongside the existing icon imports. Use the existing `cn` import. If `chalk-*` tokens are not in scope in this file (it uses `fog-*`), match the file's existing token family (`fog-100`/`fog-300`) instead - check the file's other JSX and stay consistent.

- [ ] **Step 2: Branch on kind in the task list**

At the task list render (~813-823), replace the single `<TaskCard .../>` with a kind branch:
```tsx
<li key={t.id}>
  {t.kind === "saga" ? (
    <SagaCard task={t} onOpen={onOpenTask} />
  ) : (
    <TaskCard
      task={t}
      roadmap={roadmap}
      blockedBy={openDeps.length}
      unlocks={unlocks}
      onOpen={onOpenTask}
      onRename={onRename}
      onDelete={onDelete}
    />
  )}
</li>
```

- [ ] **Step 3: Verify (typecheck + build)**

Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm build`
Expected: builds clean.

- [ ] **Step 4: Browser check**

Start the dashboard against a project that has a saga task (create one via `vibe saga create "Demo saga"` then `vibe saga add-step <id> "first step"`). Confirm the board renders the saga as a compact violet container card with the step strip, in both dark and light themes. Capture a screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/routes/BoardPage.tsx
git commit -m "feat(saga): board renders sagas as compact container cards"
```

---

### Task 7: Saga detail - author enriched steps

**Files:**
- Modify: `src/ui/app/routes/TaskDetailPage.tsx` (`ChecklistSection` ~770-1041; its add-item form and `ChecklistRow`)

**Interfaces:**
- Consumes: `api.addChecklistItem(taskId, text, fields)`, `api.updateChecklistItem(taskId, itemId, patch)` from Task 5.
- Produces: when `task.kind === "saga"`, the add-step form accepts an objective and an acceptance check; each step row shows its objective/acceptance.

UI verification per house norms: typecheck + build + browser check.

- [ ] **Step 1: Show step fields when kind is saga**

In `ChecklistSection`, when `task.kind === "saga"`, extend the "add new item" form with two optional inputs (objective, acceptance) composed from the same input styling already used in that form, and pass them to `addChecklistItem`:
```tsx
// inside the add-item submit handler, when task.kind === "saga":
await api.addChecklistItem(task.id, text.trim(), {
  objective: objective.trim() || undefined,
  acceptanceCheck: acceptance.trim() || undefined,
});
```
Add `objective`/`acceptance` `useState("")` next to the existing `text` state; render the two inputs only when `task.kind === "saga"`. Reuse the existing input class from the current add-item field; do not introduce a bare unstyled `<input>` look - match the form's existing field.

- [ ] **Step 2: Render objective/acceptance on each saga step row**

In `ChecklistRow` (or directly in the items map), when the item has a non-empty `objective` or `acceptanceCheck`, render them under the row text in a secondary line (violet label + `fog-300` body, never `fog-400`):
```tsx
{item.objective ? (
  <div className="mt-0.5 text-[10.5px]">
    <span className="text-violet-soft">objective</span>{" "}
    <span className="text-fog-300">{item.objective}</span>
  </div>
) : null}
{item.acceptanceCheck ? (
  <div className="text-[10.5px]">
    <span className="text-violet-soft">accept</span>{" "}
    <span className="text-fog-300">{item.acceptanceCheck}</span>
  </div>
) : null}
```
Place these inside the row's main text column so they wrap under the step text, not next to the controls.

- [ ] **Step 3: Verify (typecheck + build)**

Run: `pnpm typecheck`
Expected: no errors.
Run: `pnpm build`
Expected: builds clean.

- [ ] **Step 4: Browser check**

Open a saga task's detail. Add a step with an objective and an acceptance check; confirm they persist (reload) and render under the step. Confirm a non-saga task's checklist is visually unchanged. Check both themes. Screenshot.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app/routes/TaskDetailPage.tsx
git commit -m "feat(saga): author objective + acceptance on saga steps in detail view"
```

---

## Phase close-out

- [ ] Run full gates: `pnpm typecheck && pnpm test && pnpm build` - all green.
- [ ] Update `CHANGELOG.md` with a Saga (surface) entry and bump the version (`npm version minor --no-git-tag-version`).
- [ ] Update `docs/TODO.md`: tick the Phase 1 (Surface) item under the Saga work.
- [ ] Note the deferred-to-Phase-2 fields (`sagaState`, `dependsOn`, `runId`, `outcomeSummary`) so the engine phase picks them up.
- [ ] Produce the Implementation Report (per `CLAUDE.md` §4) and pause for review before Phase 2.

## Self-Review

**Spec coverage (against `docs/superpowers/specs/2026-06-29-saga-tasks-conductor-design.md` §8 Phase 1):**
- Data model (`Task.kind`, enriched `Step`) - Task 1. (Deferred fields documented in Global Constraints.)
- Step authoring (CLI + UI add/edit) - Tasks 3 (CLI), 7 (UI), 2/4 (service + HTTP).
- Board container card - Task 6.
- Saga detail view - Task 7 (extends existing `TaskDetailPage`).

**Placeholder scan:** No TBD/TODO/"implement appropriately". Two precise file-reference instructions ("copy the import header from roadmap.ts:1-13", "mirror the harness from server-roadmap.test.ts") point at exact existing code, not vague hand-waving.

**Type consistency:** `kind`/`TaskKind`, `objective`/`acceptanceCheck`/`fileHints`, `addChecklistItem(taskId, text, fields)`, `ChecklistItemPatch` keys are named identically across Tasks 1-7. The service `fields` object shape matches the CLI opts mapping and the route body keys.

**Known soft spots (carried, not blocking):** `SagaCard` token family (`chalk-*` vs `fog-*`) must match `BoardPage.tsx`'s existing usage - Step 1 of Task 6 flags this; the executor confirms against the file.
