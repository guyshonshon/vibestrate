import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import { RunQueue } from "../../scheduler/run-queue.js";
import { runSchedulerLoop } from "../../scheduler/scheduler-service.js";
import { ConflictsStore } from "../../scheduler/conflict-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import {
  acquireLock,
  isProcessAlive,
  releaseLock,
} from "../../scheduler/scheduler-lock.js";
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

async function cmdAdd(
  taskId: string,
  opts: { source?: string },
): Promise<number> {
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
    source: opts.source ?? "user",
  });
  await roadmap.updateTaskStatus(taskId, "queued");
  console.log(`${symbol.ok()} Queued ${color.bold(taskId)} (source ${opts.source ?? "user"}).`);
  return 0;
}

async function cmdRun(opts: { exitWhenDrained?: boolean }): Promise<number> {
  let acquired = false;
  let projectRoot: string | null = null;
  try {
    const { root } = await context();
    projectRoot = root;
    // Refuse to start a second scheduler in the same project. Two
    // loops competing for the same queue would double-pick tasks.
    const lock = await acquireLock(root);
    if (!lock.ok) {
      console.error(
        `${symbol.fail()} Another scheduler is already running for this project.`,
      );
      console.error(
        indent(
          `held by pid ${color.bold(String(lock.holder.pid))} on ${color.bold(lock.holder.host)} since ${lock.holder.startedAt}.`,
        ),
      );
      console.error(
        indent(
          "Amaco will reclaim crashed or stale schedulers automatically once their heartbeat expires.",
        ),
      );
      return 1;
    }
    acquired = true;
    if (lock.reclaimed) {
      console.log(
        `${symbol.warn()} Reclaimed a stale scheduler lock (${lock.reclaimReason ?? "stale"}).`,
      );
    }

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
    let parentMonitor: NodeJS.Timeout | null = null;
    let forceTimer: NodeJS.Timeout | null = null;
    const requestStop = (reason: "SIGINT" | "SIGTERM" | "parent-exit") => {
      if (stopRequested) {
        console.log("");
        console.log(color.dim("Force-exiting scheduler (second interrupt)."));
        process.exit(reason === "SIGINT" ? 130 : 143);
      }
      stopRequested = true;
      if (reason === "SIGINT") console.log("");
      console.log(
        color.dim(
          reason === "parent-exit"
            ? "Parent process exited; stopping scheduler and active task..."
            : "Stopping scheduler and active task... press Ctrl+C again to force.",
        ),
      );
      void handle.stop();
      forceTimer = setTimeout(() => {
        console.log(color.dim("Scheduler shutdown timed out; force-exiting."));
        process.exit(reason === "SIGINT" ? 130 : 143);
      }, 10_000);
      forceTimer.unref?.();
    };
    const parentPid = Number.parseInt(process.env.AMACO_PARENT_PID ?? "", 10);
    if (
      Number.isInteger(parentPid) &&
      parentPid > 0 &&
      parentPid !== process.pid
    ) {
      parentMonitor = setInterval(() => {
        if (!stopRequested && !isProcessAlive(parentPid)) {
          requestStop("parent-exit");
        }
      }, 1000);
      parentMonitor.unref?.();
    }
    const onSigint = () => requestStop("SIGINT");
    const onSigterm = () => requestStop("SIGTERM");
    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
    await handle.finished;
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    if (parentMonitor) clearInterval(parentMonitor);
    if (forceTimer) clearTimeout(forceTimer);
    console.log(`${symbol.ok()} Scheduler exited.`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  } finally {
    if (acquired && projectRoot) {
      await releaseLock(projectRoot).catch(() => undefined);
    }
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
    .option(
      "--source <name>",
      "origin label for fairness / per-source quotas (default: user)",
    )
    .action(async (id: string, opts: { source?: string }) => {
      const code = await cmdAdd(id, opts);
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
