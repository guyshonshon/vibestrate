import { Command } from "commander";
import path from "node:path";
import { spawn } from "node:child_process";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { writeTaskReport } from "../../roadmap/task-report.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isAmacoError } from "../../utils/errors.js";
import type { TaskStatus } from "../../roadmap/roadmap-types.js";

async function svc() {
  const detected = await detectProject(process.cwd());
  return { svc: new RoadmapService(detected.projectRoot), root: detected.projectRoot };
}

const STATUS_COLOR: Record<TaskStatus, (s: string) => string> = {
  backlog: color.dim,
  ready: color.cyan,
  queued: color.cyan,
  running: color.cyan,
  waiting_for_approval: color.yellow,
  blocked: color.yellow,
  review: color.cyan,
  done: color.green,
  failed: color.red,
  cancelled: color.dim,
};

async function cmdAdd(
  title: string,
  opts: {
    description?: string;
    priority?: string;
    roadmap?: string;
    skills?: string;
    files?: string;
    json?: boolean;
  },
): Promise<number> {
  try {
    const { svc: s } = await svc();
    await s.init();
    const task = await s.addTask({
      title,
      description: opts.description,
      priority:
        opts.priority === "low" || opts.priority === "high"
          ? opts.priority
          : "medium",
      roadmapItemId: opts.roadmap ?? null,
      requiredSkills: opts.skills ? opts.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      touchedFiles: opts.files ? opts.files.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
      return 0;
    }
    console.log(`${symbol.ok()} Task added.`);
    console.log(indent(`id: ${color.bold(task.id)}`));
    console.log(indent(`title: ${task.title}`));
    if (task.roadmapItemId) {
      console.log(indent(`roadmap item: ${task.roadmapItemId}`));
    }
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdList(opts: { json?: boolean; status?: string }): Promise<number> {
  const { svc: s } = await svc();
  await s.init();
  let tasks = await s.listTasks();
  if (opts.status) {
    tasks = tasks.filter((t) => t.status === opts.status);
  }
  if (opts.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return 0;
  }
  if (tasks.length === 0) {
    console.log("No tasks yet.");
    console.log(
      `  ${symbol.arrow()} Add one: ${color.bold('amaco tasks add "Create setup wizard"')}`,
    );
    return 0;
  }
  console.log(header("Tasks"));
  console.log("");
  for (const t of tasks) {
    const colorFn = STATUS_COLOR[t.status];
    console.log(`${color.bold(t.title)} ${color.dim(`(${t.id})`)}`);
    console.log(
      indent(
        `${colorFn(t.status)} · priority: ${t.priority} · runs: ${t.runIds.length}${t.commentsCount > 0 ? ` · open comments: ${t.commentsCount}` : ""}`,
      ),
    );
    if (t.dependencies.length > 0) {
      console.log(indent(color.dim(`depends on: ${t.dependencies.join(", ")}`)));
    }
    console.log("");
  }
  return 0;
}

async function cmdShow(id: string, opts: { json?: boolean }): Promise<number> {
  const { svc: s, root } = await svc();
  const task = await s.getTask(id);
  if (!task) {
    console.error(`${symbol.fail()} Task "${id}" not found.`);
    return 1;
  }
  const comments = await s.listComments(id);
  if (opts.json) {
    console.log(JSON.stringify({ task, comments }, null, 2));
    return 0;
  }
  console.log(header(task.title));
  console.log(indent(`id: ${task.id}`));
  console.log(indent(`status: ${STATUS_COLOR[task.status](task.status)} · priority: ${task.priority} · risk: ${task.riskLevel}`));
  if (task.roadmapItemId) console.log(indent(`roadmap: ${task.roadmapItemId}`));
  if (task.description) {
    console.log("");
    console.log(task.description);
  }
  if (task.runIds.length > 0) {
    console.log("");
    console.log("Runs:");
    for (const r of task.runIds) {
      console.log(indent(`- ${color.dim(r)}`));
    }
    if (task.currentRunId) {
      console.log(indent(`current: ${color.bold(task.currentRunId)}`));
    }
  }
  if (comments.length > 0) {
    const open = comments.filter((c) => !c.resolved);
    console.log("");
    console.log(`Comments: ${comments.length} total · ${open.length} open`);
    for (const c of open.slice(0, 10)) {
      console.log(indent(`- ${c.body}`));
    }
  }
  console.log("");
  console.log(color.dim(`task report path: ${path.relative(root, `.amaco/roadmap/tasks/${id}-report.md`)}`));
  return 0;
}

async function cmdComment(taskId: string, body: string): Promise<number> {
  if (!body || !body.trim()) {
    console.error(`${symbol.fail()} Comment body is required.`);
    return 1;
  }
  try {
    const { svc: s } = await svc();
    const c = await s.addComment(taskId, { body });
    console.log(`${symbol.ok()} Comment added (${color.dim(c.id)}).`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdSetStatus(taskId: string, status: TaskStatus): Promise<number> {
  try {
    const { svc: s } = await svc();
    await s.updateTaskStatus(taskId, status);
    console.log(`${symbol.ok()} Task ${color.bold(taskId)} → ${status}.`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdQueue(taskId: string): Promise<number> {
  try {
    const { svc: s, root } = await svc();
    const t = await s.getTask(taskId);
    if (!t) {
      console.error(`${symbol.fail()} Task "${taskId}" not found.`);
      return 1;
    }
    await s.updateTaskStatus(taskId, "queued");
    const { RunQueue } = await import("../../scheduler/run-queue.js");
    const q = new RunQueue(root);
    const { nowIso } = await import("../../utils/time.js");
    await q.enqueue({
      taskId,
      enqueuedAt: nowIso(),
      priority: t.priority,
    });
    console.log(`${symbol.ok()} Task ${color.bold(taskId)} queued.`);
    console.log(
      indent(
        `${symbol.arrow()} Start the scheduler: ${color.bold("amaco queue run")}`,
      ),
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdReport(taskId: string): Promise<number> {
  try {
    const { svc: s, root } = await svc();
    const t = await s.getTask(taskId);
    if (!t) {
      console.error(`${symbol.fail()} Task "${taskId}" not found.`);
      return 1;
    }
    const parent = t.roadmapItemId ? await s.getRoadmapItem(t.roadmapItemId) : null;
    const comments = await s.listComments(taskId);
    const target = await writeTaskReport(root, { task: t, parent, comments });
    console.log(`${symbol.ok()} Wrote ${path.relative(root, target)}`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdRun(taskId: string): Promise<number> {
  // Foreground: spawn `amaco run --task <id>` against the local CLI bin so the
  // user sees progress live and the orchestrator handles task linkage.
  const { svc: s, root } = await svc();
  const task = await s.getTask(taskId);
  if (!task) {
    console.error(`${symbol.fail()} Task "${taskId}" not found.`);
    return 1;
  }
  // Spawn process self.
  const { fileURLToPath } = await import("node:url");
  const fs = await import("node:fs");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "..", "..", "dist", "index.js"),
    path.resolve(here, "..", "..", "index.js"),
  ];
  const bin = candidates.find((p) => fs.existsSync(p));
  if (!bin) {
    console.error(
      `${symbol.fail()} Could not locate Amaco bundle. Run \`pnpm build\` first.`,
    );
    return 1;
  }
  return new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [bin, "run", task.title, "--task", task.id],
      { cwd: root, stdio: "inherit" },
    );
    child.on("exit", (code) => resolve(code ?? -1));
    child.on("error", () => resolve(-1));
  });
}

export function buildTasksCommand(): Command {
  const cmd = new Command("tasks").description(
    "Manage local tasks: backlog → queued → running → done.",
  );

  cmd
    .command("add <title>")
    .description("Create a task.")
    .option("-d, --description <text>")
    .option("-p, --priority <p>", "low | medium | high", "medium")
    .option("--roadmap <id>", "link to a roadmap item id")
    .option("--skills <list>", "comma-separated skill names")
    .option("--files <list>", "comma-separated likely-touched files")
    .option("--json", "emit JSON")
    .action(async (title: string, opts) => {
      const code = await cmdAdd(title, opts);
      process.exit(code);
    });

  cmd
    .command("list")
    .description("List tasks.")
    .option("--status <s>", "filter by status")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const code = await cmdList(opts);
      process.exit(code);
    });

  cmd
    .command("show <id>")
    .description("Show a task with comments and run history.")
    .option("--json", "emit JSON")
    .action(async (id: string, opts) => {
      const code = await cmdShow(id, opts);
      process.exit(code);
    });

  cmd
    .command("comment <id> <body>")
    .description("Add a comment to a task.")
    .action(async (id: string, body: string) => {
      const code = await cmdComment(id, body);
      process.exit(code);
    });

  cmd
    .command("ready <id>")
    .description("Mark a task ready to run.")
    .action(async (id: string) => {
      const code = await cmdSetStatus(id, "ready");
      process.exit(code);
    });

  cmd
    .command("cancel <id>")
    .description("Cancel a task.")
    .action(async (id: string) => {
      const code = await cmdSetStatus(id, "cancelled");
      process.exit(code);
    });

  cmd
    .command("queue <id>")
    .description("Add a task to the scheduler queue.")
    .action(async (id: string) => {
      const code = await cmdQueue(id);
      process.exit(code);
    });

  cmd
    .command("run <id>")
    .description("Run this task now (foreground; same as amaco run --task <id>).")
    .action(async (id: string) => {
      const code = await cmdRun(id);
      process.exit(code);
    });

  cmd
    .command("report <id>")
    .description("Generate a Markdown task report at .amaco/roadmap/tasks/<id>-report.md.")
    .action(async (id: string) => {
      const code = await cmdReport(id);
      process.exit(code);
    });

  return cmd;
}
