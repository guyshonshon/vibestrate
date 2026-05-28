import { Command } from "commander";
import path from "node:path";
import { spawn } from "node:child_process";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { writeTaskReport } from "../../roadmap/task-report.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";
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
    effort?: string;
    provider?: string;
    readOnly?: boolean;
    autoEffort?: boolean;
  },
): Promise<number> {
  try {
    const { svc: s } = await svc();
    await s.init();
    if (opts.effort && opts.effort !== "low" && opts.effort !== "medium" && opts.effort !== "high") {
      console.error(`--effort must be one of low|medium|high (got "${opts.effort}").`);
      return 2;
    }
    // Always classify, even when the user didn't ask for --auto-effort, so
    // we can print an honest "(suggested: …)" line below. The classifier
    // is free and deterministic.
    const fileList = opts.files
      ? opts.files.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const { classifyEffort } = await import("../../core/effort-heuristic.js");
    const heuristic = classifyEffort({
      text: `${title}${opts.description ? " " + opts.description : ""}`,
      files: fileList,
    });
    let effortToUse = opts.effort as "low" | "medium" | "high" | undefined;
    if (!effortToUse && opts.autoEffort) {
      effortToUse = heuristic.effort;
    }
    const task = await s.addTask({
      title,
      description: opts.description,
      priority:
        opts.priority === "low" || opts.priority === "high"
          ? opts.priority
          : "medium",
      roadmapItemId: opts.roadmap ?? null,
      requiredSkills: opts.skills ? opts.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      touchedFiles: fileList,
      effort: effortToUse ?? null,
      providerOverride: opts.provider ?? null,
      readOnly: opts.readOnly ?? false,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ...task, _heuristic: heuristic }, null, 2));
      return 0;
    }
    console.log(`${symbol.ok()} Task added.`);
    console.log(indent(`id: ${color.bold(task.id)}`));
    console.log(indent(`title: ${task.title}`));
    if (task.roadmapItemId) {
      console.log(indent(`roadmap item: ${task.roadmapItemId}`));
    }
    // Always surface the heuristic verdict so the user can see what the
    // signals say — even when --effort or --auto-effort was used.
    const verdictLine =
      task.effort === heuristic.effort
        ? `effort: ${color.bold(task.effort ?? "(none)")} ${color.dim(`(matches suggestion @ ${heuristic.confidence})`)}`
        : task.effort
          ? `effort: ${color.bold(task.effort)} ${color.dim(`(suggested ${heuristic.effort} @ ${heuristic.confidence})`)}`
          : `effort: ${color.dim("(none)")} ${color.dim(`— suggested ${heuristic.effort} @ ${heuristic.confidence}; pass --auto-effort or --effort ${heuristic.effort} to apply`)}`;
    console.log(indent(verdictLine));
    for (const r of heuristic.reasons.slice(0, 3)) {
      console.log(indent(color.dim(`  · ${r}`)));
    }
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
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
      `  ${symbol.arrow()} Add one: ${color.bold('vibestrate tasks add "Create setup wizard"')}`,
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
  console.log(color.dim(`task report path: ${path.relative(root, `.vibestrate/roadmap/tasks/${id}-report.md`)}`));
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
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
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
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
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
      source: "user",
    });
    console.log(`${symbol.ok()} Task ${color.bold(taskId)} queued.`);
    console.log(
      indent(
        `${symbol.arrow()} Start the scheduler: ${color.bold("vibestrate queue run")}`,
      ),
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
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
    const allTasks = await s.listTasks();
    // Resolve a proposal source by scanning audit files for this task id.
    const { roadmapProposalsDir } = await import("../../utils/paths.js");
    const fsp = await import("node:fs/promises");
    const dir = roadmapProposalsDir(root);
    let proposalId: string | null = null;
    try {
      for (const file of await fsp.readdir(dir)) {
        if (!file.endsWith("-accepted.json")) continue;
        try {
          const audit = JSON.parse(
            await fsp.readFile(path.join(dir, file), "utf8"),
          ) as { proposalId: string; createdTaskIds: string[] };
          if (audit.createdTaskIds?.includes(taskId)) {
            proposalId = audit.proposalId;
            break;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // proposals dir absent — fine
    }
    const target = await writeTaskReport(root, {
      task: t,
      parent,
      comments,
      allTasks,
      proposalId,
    });
    console.log(`${symbol.ok()} Wrote ${path.relative(root, target)}`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdRun(taskId: string): Promise<number> {
  // Foreground: spawn `vibestrate run --task <id>` against the local CLI bin so the
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
      `${symbol.fail()} Could not locate Vibestrate bundle. Run \`pnpm build\` first.`,
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
    .option(
      "--effort <level>",
      "effort bucket (low|medium|high). Maps to a provider via project.yml#effortMap.",
    )
    .option(
      "--provider <id>",
      "override the provider for runs spawned from this task (wins over --effort).",
    )
    .option(
      "--read-only",
      "investigation-only: runs spawned from this task skip executor + fix loop and refuse apply/validate/revert.",
    )
    .option(
      "--auto-effort",
      "apply the heuristic effort suggestion when --effort isn't passed.",
    )
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
    .description("Run this task now (foreground; same as vibestrate run --task <id>).")
    .action(async (id: string) => {
      const code = await cmdRun(id);
      process.exit(code);
    });

  cmd
    .command("report <id>")
    .description("Generate a Markdown task report at .vibestrate/roadmap/tasks/<id>-report.md.")
    .action(async (id: string) => {
      const code = await cmdReport(id);
      process.exit(code);
    });

  return cmd;
}
