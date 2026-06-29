import path from "node:path";
import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";
import { runRunCommand } from "./run.js";

async function svc() {
  const detected = await detectProject(process.cwd());
  return new RoadmapService(detected.projectRoot);
}

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

async function cmdEditStep(
  taskId: string,
  itemId: string,
  opts: { text?: string; objective?: string; acceptance?: string; files?: string; json?: boolean },
): Promise<number> {
  try {
    const patch: Record<string, unknown> = {};
    if (opts.text !== undefined) patch.text = opts.text;
    if (opts.objective !== undefined) patch.objective = opts.objective;
    if (opts.acceptance !== undefined) patch.acceptanceCheck = opts.acceptance;
    if (opts.files !== undefined) patch.fileHints = opts.files.split(",").map((f) => f.trim()).filter(Boolean);
    if (Object.keys(patch).length === 0) {
      console.error(`${symbol.fail()} At least one of --text, --objective, --acceptance, --files is required.`);
      return 1;
    }
    const s = await svc();
    const { item } = await s.updateChecklistItem(taskId, itemId, patch as Parameters<typeof s.updateChecklistItem>[2]);
    if (opts.json) { console.log(JSON.stringify(item, null, 2)); return 0; }
    console.log(`${symbol.ok()} Step ${color.bold(itemId)} updated on ${color.bold(taskId)}.`);
    console.log(indent(`text: ${item.text}`));
    if (item.objective) console.log(indent(`objective: ${item.objective}`));
    if (item.acceptanceCheck) console.log(indent(`accept: ${item.acceptanceCheck}`));
    if (item.fileHints.length) console.log(indent(`files: ${item.fileHints.join(", ")}`));
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdReorder(
  taskId: string,
  orderedIds: string,
  opts: { json?: boolean },
): Promise<number> {
  try {
    const ids = orderedIds.split(",").map((id) => id.trim()).filter(Boolean);
    const s = await svc();
    const task = await s.reorderChecklist(taskId, ids);
    if (opts.json) { console.log(JSON.stringify(task.checklist.map((c) => c.id), null, 2)); return 0; }
    console.log(`${symbol.ok()} Checklist reordered on ${color.bold(taskId)}.`);
    task.checklist.forEach((c, i) => {
      console.log(indent(`${i + 1}. ${c.id}  ${c.text}`));
    });
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

export async function cmdSequence(
  taskId: string,
  opts: { json?: boolean },
): Promise<number> {
  // Pre-flight: load + validate the saga BEFORE flipping any lifecycle state, so
  // a bad id leaves the task untouched.
  let s: RoadmapService;
  try {
    s = await svc();
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
  const task = await s.getTask(taskId);
  if (!task) {
    console.error(`${symbol.fail()} Saga "${taskId}" not found.`);
    return 1;
  }
  if (task.kind !== "saga") {
    console.error(
      `${symbol.fail()} Task "${taskId}" is not a saga (kind: ${task.kind}). Sequence only runs kind=saga tasks.`,
    );
    return 1;
  }
  if (task.checklist.length === 0) {
    console.error(
      `${symbol.fail()} Saga "${taskId}" has no steps. Add steps with ${color.bold(`vibe saga add-step ${taskId} "<text>"`)}.`,
    );
    return 1;
  }

  // Mark the lifecycle as sequencing. M1/M4 own the transition to "halted"
  // (from inside the run); we never overwrite that.
  await s.setSagaState(taskId, "sequencing");

  if (!opts.json) {
    console.log(
      `${symbol.bullet()} Sequencing saga ${color.bold(taskId)} (${task.checklist.length} steps): ${task.title}`,
    );
    console.log("");
  }

  // Launch through the AUDITED run path. sagaMode flows into the existing
  // Orchestrator, which provides clean halt-with-reset + the between-steps
  // budget + the per-task run lock. No raw command spawn, no shell-out.
  const code = await runRunCommand(task.title, {
    taskId,
    flowId: "saga",
    checklistMode: "continuous",
    sagaMode: true,
  });

  // Attribute the outcome by the run's exit code (runRunCommand contract):
  //   0 = merge_ready (clean)                  -> "done"
  //   1 = the run never STARTED (the task is locked by a concurrent run, or a
  //       pre-run failure) -> a complete state NO-OP. Another invocation may own
  //       this saga's lifecycle; we must not touch it or claim any outcome.
  //   2 = the run threw; 3 = blocked/failed/aborted. The run executed but did
  //       NOT complete, and the orchestrator recorded no step-level halt (e.g.
  //       the holistic review blocked, a policy block, or an abort). Record a
  //       clean halt so the lifecycle is honest + resumable instead of being
  //       stranded at "sequencing" or - the old bug - mislabeled "done".
  // A real step/budget halt already set sagaState="halted" from inside the run;
  // we never overwrite that.
  if (code === 1) {
    // runRunCommand already printed the reason (e.g. TaskLockedError). Leave the
    // lifecycle exactly as we found it.
    return 1;
  }
  const after = await s.getTask(taskId);
  let halted = after?.sagaState === "halted";
  if (!halted) {
    if (code === 0) {
      await s.setSagaState(taskId, "done");
    } else {
      await s.recordSagaHalt(taskId, {
        reason: `run ended ${code === 2 ? "failed" : "blocked"} before completing the saga`,
        atStepId: null,
        summary:
          "The saga run did not complete cleanly (the holistic review blocked, a policy block, or an abort). Committed steps are kept; re-run to continue.",
      });
      halted = true;
    }
  }
  const final = await s.getTask(taskId);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          taskId,
          sagaState: final?.sagaState ?? null,
          sagaHalt: final?.sagaHalt ?? null,
          runExitCode: code,
        },
        null,
        2,
      ),
    );
    // A halt is a real, reportable outcome - not a tool failure. Exit 0 on a
    // clean halt-with-reason; only a genuine run failure (exit 2) propagates.
    return code === 2 ? 2 : 0;
  }

  console.log("");
  if (halted) {
    console.log(
      `${symbol.warn()} ${header("Saga halted")} ${color.yellow(color.bold(final?.sagaHalt?.reason ?? "halted"))}`,
    );
    if (final?.sagaHalt?.summary) {
      console.log(indent(final.sagaHalt.summary));
    }
    // A step-level halt reset one step to pending (resume re-attempts it from the
    // clean tip); a run-level block/abort halt (atStepId null) reset no step.
    const resumeHint = final?.sagaHalt?.atStepId
      ? `The failed step is reset to pending - fix it, then re-run ${color.bold(`vibe saga sequence ${taskId}`)} to resume from the clean tip.`
      : `Address the issue, then re-run ${color.bold(`vibe saga sequence ${taskId}`)} to continue.`;
    console.log(indent(`${symbol.arrow()} ${resumeHint}`));
  } else {
    console.log(`${symbol.ok()} ${header("Saga done")} all ${final?.checklist.length ?? task.checklist.length} steps completed.`);
  }
  return code === 2 ? 2 : 0;
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
    .command("edit-step <taskId> <itemId>")
    .description("Edit fields of an existing step.")
    .option("--text <t>", "new step text")
    .option("--objective <t>", "scoped goal for the step")
    .option("--acceptance <t>", "done-when check for the step")
    .option("--files <list>", "comma-separated file hints")
    .option("--json", "emit JSON")
    .action(async (taskId: string, itemId: string, opts) =>
      process.exit(await cmdEditStep(taskId, itemId, opts)),
    );
  cmd
    .command("reorder <taskId> <orderedIds>")
    .description("Reorder checklist steps (comma-separated item ids).")
    .option("--json", "emit JSON")
    .action(async (taskId: string, orderedIds: string, opts) =>
      process.exit(await cmdReorder(taskId, orderedIds, opts)),
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
  cmd
    .command("sequence <taskId>")
    .description(
      "Run a Saga end-to-end: launch the saga flow over its steps (clean halt-with-reset, per-saga budget, run lock).",
    )
    .option("--json", "emit JSON")
    .action(async (taskId: string, opts) => process.exit(await cmdSequence(taskId, opts)));
  return cmd;
}
