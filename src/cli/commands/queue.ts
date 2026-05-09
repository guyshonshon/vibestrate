import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import { RunQueue } from "../../scheduler/run-queue.js";
import { runSchedulerLoop } from "../../scheduler/scheduler-service.js";
import { ConflictsStore } from "../../scheduler/conflict-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";
import { nowIso } from "../../utils/time.js";

async function context() {
  const detected = await detectProject(process.cwd());
  const queue = new RunQueue(detected.projectRoot);
  return { root: detected.projectRoot, queue };
}

async function cmdList(opts: { json?: boolean }): Promise<number> {
  const { queue, root } = await context();
  const file = await queue.readQueue();
  const state = await queue.readState();
  if (opts.json) {
    console.log(JSON.stringify({ ...file, state }, null, 2));
    return 0;
  }
  console.log(header("Queue"));
  console.log(
    indent(
      `policy: ${state.queuePolicy} · maxConcurrentRuns: ${state.maxConcurrentRuns} · conflict: ${state.conflictPolicy}${state.paused ? ` · ${color.yellow("paused")}` : ""}`,
    ),
  );
  console.log("");
  if (state.runningTaskIds.length > 0) {
    console.log("Running:");
    for (const id of state.runningTaskIds) console.log(indent(`- ${id}`));
    console.log("");
  }
  if (file.entries.length === 0) {
    console.log(color.dim("Queue is empty."));
    return 0;
  }
  console.log("Waiting:");
  for (const e of file.entries) {
    console.log(
      indent(`- ${color.bold(e.taskId)} (priority ${e.priority}, queued ${e.enqueuedAt})`),
    );
  }
  void root;
  return 0;
}

async function cmdAdd(taskId: string): Promise<number> {
  const { queue, root } = await context();
  const roadmap = new RoadmapService(root);
  const task = await roadmap.getTask(taskId);
  if (!task) {
    console.error(`${symbol.fail()} Task "${taskId}" not found.`);
    return 1;
  }
  await queue.enqueue({
    taskId,
    enqueuedAt: nowIso(),
    priority: task.priority,
  });
  await roadmap.updateTaskStatus(taskId, "queued");
  console.log(`${symbol.ok()} Queued ${color.bold(taskId)}.`);
  return 0;
}

async function cmdRun(opts: { exitWhenDrained?: boolean }): Promise<number> {
  try {
    const { root } = await context();
    const loaded = await loadConfig(root);
    console.log(
      `${symbol.ok()} Scheduler started. maxConcurrentRuns=${loaded.config.scheduler.maxConcurrentRuns}, queuePolicy=${loaded.config.scheduler.queuePolicy}, conflictPolicy=${loaded.config.scheduler.conflictPolicy}.`,
    );
    console.log(color.dim("Press Ctrl+C to stop."));
    const handle = await runSchedulerLoop({
      projectRoot: root,
      schedulerConfig: loaded.config.scheduler,
      exitWhenDrained: opts.exitWhenDrained,
    });
    let stopRequested = false;
    process.on("SIGINT", () => {
      if (stopRequested) return;
      stopRequested = true;
      console.log("");
      console.log(color.dim("Stopping scheduler (current runs will finish)..."));
      void handle.stop();
    });
    process.on("SIGTERM", () => {
      if (stopRequested) return;
      stopRequested = true;
      void handle.stop();
    });
    await handle.finished;
    console.log(`${symbol.ok()} Scheduler exited.`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdPause(): Promise<number> {
  const { queue } = await context();
  const state = await queue.readState();
  await queue.writeState({ ...state, paused: true });
  console.log(`${symbol.ok()} Scheduler paused. New tasks will not start.`);
  return 0;
}

async function cmdResume(): Promise<number> {
  const { queue } = await context();
  const state = await queue.readState();
  await queue.writeState({ ...state, paused: false });
  console.log(`${symbol.ok()} Scheduler resumed.`);
  return 0;
}

async function cmdStatus(opts: { json?: boolean }): Promise<number> {
  const { queue, root } = await context();
  const state = await queue.readState();
  const file = await queue.readQueue();
  const conflicts = await new ConflictsStore(root).read();
  if (opts.json) {
    console.log(JSON.stringify({ state, queue: file, conflicts }, null, 2));
    return 0;
  }
  console.log(header("Scheduler status"));
  console.log(indent(`paused: ${state.paused}`));
  console.log(indent(`running: ${state.runningTaskIds.length} (${state.runningTaskIds.join(", ") || "—"})`));
  console.log(indent(`queued: ${file.entries.length}`));
  console.log(
    indent(
      `policy: ${state.queuePolicy} · max concurrent: ${state.maxConcurrentRuns} · conflict: ${state.conflictPolicy}`,
    ),
  );
  if (conflicts.warnings.length > 0) {
    console.log("");
    console.log(`${symbol.warn()} ${conflicts.warnings.length} conflict warning(s).`);
    for (const w of conflicts.warnings.slice(-5)) {
      console.log(
        indent(
          `- ${w.taskId} ↔ ${w.conflictsWith.join(", ")} on ${w.overlappingFiles.length} file(s) ${w.blocked ? color.yellow("(blocked)") : color.dim("(warned)")}`,
        ),
      );
    }
  }
  return 0;
}

async function cmdRemove(taskId: string): Promise<number> {
  const { queue, root } = await context();
  await queue.remove(taskId);
  const roadmap = new RoadmapService(root);
  const task = await roadmap.getTask(taskId);
  if (task && task.status === "queued") {
    await roadmap.updateTaskStatus(taskId, "ready");
  }
  console.log(`${symbol.ok()} Removed ${color.bold(taskId)} from queue.`);
  return 0;
}

export function buildQueueCommand(): Command {
  const cmd = new Command("queue").description(
    "Manage the local task scheduler queue.",
  );

  cmd
    .command("list")
    .description("Show the queue and running tasks.")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const code = await cmdList(opts);
      process.exit(code);
    });

  cmd
    .command("add <taskId>")
    .description("Add a task to the queue.")
    .action(async (id: string) => {
      const code = await cmdAdd(id);
      process.exit(code);
    });

  cmd
    .command("remove <taskId>")
    .description("Remove a task from the queue.")
    .action(async (id: string) => {
      const code = await cmdRemove(id);
      process.exit(code);
    });

  cmd
    .command("run")
    .description("Start the local scheduler loop and process queued tasks.")
    .option(
      "--exit-when-drained",
      "exit once the queue is empty (useful in scripts)",
    )
    .action(async (opts) => {
      const code = await cmdRun(opts);
      process.exit(code);
    });

  cmd
    .command("pause")
    .description("Pause the scheduler (new tasks will not start).")
    .action(async () => {
      const code = await cmdPause();
      process.exit(code);
    });

  cmd
    .command("resume")
    .description("Resume the scheduler.")
    .action(async () => {
      const code = await cmdResume();
      process.exit(code);
    });

  cmd
    .command("status")
    .description("Print scheduler state and recent conflict warnings.")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const code = await cmdStatus(opts);
      process.exit(code);
    });

  return cmd;
}
