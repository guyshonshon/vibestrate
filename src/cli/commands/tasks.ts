import { Command } from "commander";
import path from "node:path";
import { spawn } from "node:child_process";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { writeTaskReport } from "../../roadmap/task-report.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { cmdSequence, cmdStatus, cmdPause, cmdResume } from "./saga.js";
import { isVibestrateError } from "../../utils/errors.js";
import type {
  ChecklistItem,
  ChecklistItemStatus,
  TaskStatus,
} from "../../roadmap/roadmap-types.js";

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
    provider?: string;
    readOnly?: boolean;
    supervised?: boolean;
  },
): Promise<number> {
  try {
    const { svc: s } = await svc();
    await s.init();
    const fileList = opts.files
      ? opts.files.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
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
      profileOverride: opts.provider ?? null,
      readOnly: opts.readOnly ?? false,
      runMode: opts.supervised ? "supervised" : "plain",
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
      `  ${symbol.arrow()} Add one: ${color.bold('vibe tasks add "Create setup wizard"')}`,
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
  if (task.checklist.length > 0) {
    const done = task.checklist.filter((c) => c.status === "done").length;
    console.log("");
    console.log(`Checklist: ${done}/${task.checklist.length} done`);
    printChecklist(task.checklist);
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

const CHECK_ICON: Record<ChecklistItemStatus, string> = {
  pending: "○",
  in_progress: "◐",
  done: "●",
  blocked: "⊘",
};

const CHECK_COLOR: Record<ChecklistItemStatus, (s: string) => string> = {
  pending: color.dim,
  in_progress: color.cyan,
  done: color.green,
  blocked: color.yellow,
};

function printChecklist(items: ChecklistItem[]): void {
  if (items.length === 0) {
    console.log(color.dim("  (no checklist items)"));
    return;
  }
  items.forEach((it, i) => {
    const c = CHECK_COLOR[it.status];
    const num = color.dim(String(i + 1).padStart(2) + ".");
    console.log(`  ${num} ${c(CHECK_ICON[it.status])} ${it.text}`);
    console.log(indent(color.dim(`     ${it.id} · ${it.status}`)));
  });
}

async function cmdChecklistList(taskId: string, opts: { json?: boolean }): Promise<number> {
  const { svc: s } = await svc();
  const task = await s.getTask(taskId);
  if (!task) {
    console.error(`${symbol.fail()} Task "${taskId}" not found.`);
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify(task.checklist, null, 2));
    return 0;
  }
  const done = task.checklist.filter((c) => c.status === "done").length;
  console.log(header(`Checklist - ${task.title}`));
  console.log(color.dim(`${done}/${task.checklist.length} done`));
  console.log("");
  printChecklist(task.checklist);
  return 0;
}

async function cmdChecklistAdd(
  taskId: string,
  text: string,
  opts: { objective?: string; acceptance?: string; files?: string } = {},
): Promise<number> {
  try {
    const { svc: s } = await svc();
    const { item } = await s.addChecklistItem(taskId, text, {
      objective: opts.objective,
      acceptanceCheck: opts.acceptance,
      fileHints: opts.files
        ? opts.files.split(",").map((f) => f.trim()).filter(Boolean)
        : undefined,
    });
    console.log(`${symbol.ok()} Added checklist item ${color.dim(item.id)}.`);
    console.log(indent(item.text));
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdChecklistStatus(
  taskId: string,
  itemId: string,
  status: ChecklistItemStatus,
): Promise<number> {
  try {
    const { svc: s } = await svc();
    const { item } = await s.setChecklistItemStatus(taskId, itemId, status);
    console.log(
      `${symbol.ok()} ${color.dim(item.id)} → ${CHECK_COLOR[item.status](item.status)}.`,
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdChecklistEdit(
  taskId: string,
  itemId: string,
  text: string,
): Promise<number> {
  try {
    const { svc: s } = await svc();
    const { item } = await s.updateChecklistItem(taskId, itemId, { text });
    console.log(`${symbol.ok()} Updated ${color.dim(item.id)}.`);
    console.log(indent(item.text));
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdChecklistRemove(taskId: string, itemId: string): Promise<number> {
  try {
    const { svc: s } = await svc();
    await s.removeChecklistItem(taskId, itemId);
    console.log(`${symbol.ok()} Removed ${color.dim(itemId)}.`);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdChecklistPromote(
  taskId: string,
  itemId: string,
): Promise<number> {
  try {
    const { svc: s } = await svc();
    const { card } = await s.promoteChecklistItem(taskId, itemId);
    console.log(
      `${symbol.ok()} Promoted to card ${color.bold(card.id)} (${card.title}).`,
    );
    console.log(indent(color.dim(`derived from ${taskId} · item ${itemId}`)));
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdChecklistMove(
  taskId: string,
  itemId: string,
  positionArg: string,
): Promise<number> {
  try {
    const { svc: s } = await svc();
    const task = await s.getTask(taskId);
    if (!task) {
      console.error(`${symbol.fail()} Task "${taskId}" not found.`);
      return 1;
    }
    const from = task.checklist.findIndex((c) => c.id === itemId);
    if (from < 0) {
      console.error(`${symbol.fail()} Checklist item "${itemId}" not found.`);
      return 1;
    }
    const pos = Number.parseInt(positionArg, 10);
    if (!Number.isInteger(pos) || pos < 1 || pos > task.checklist.length) {
      console.error(
        `${symbol.fail()} position must be between 1 and ${task.checklist.length}.`,
      );
      return 2;
    }
    const ids = task.checklist.map((c) => c.id);
    ids.splice(from, 1);
    ids.splice(pos - 1, 0, itemId);
    const next = await s.reorderChecklist(taskId, ids);
    console.log(`${symbol.ok()} Moved ${color.dim(itemId)} to position ${pos}.`);
    printChecklist(next.checklist);
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdEnhance(
  taskId: string,
  opts: { apply?: boolean; profile?: string; json?: boolean },
): Promise<number> {
  try {
    const { root } = await svc();
    if (opts.apply) {
      const { enhanceChecklist } = await import("../../core/assist/enhance.js");
      const { added, proposal } = await enhanceChecklist(root, taskId, {
        profileId: opts.profile ?? null,
      });
      if (opts.json) {
        console.log(JSON.stringify({ added, proposal }, null, 2));
        return 0;
      }
      console.log(
        `${symbol.ok()} Added ${added.length} checklist item(s) via ${color.dim(proposal.providerId)}.`,
      );
      printChecklist(added);
      return 0;
    }
    const { proposeChecklist } = await import("../../core/assist/enhance.js");
    const proposal = await proposeChecklist(root, taskId, {
      profileId: opts.profile ?? null,
    });
    if (opts.json) {
      console.log(JSON.stringify(proposal, null, 2));
      return 0;
    }
    console.log(
      header(`Proposed checklist (${proposal.items.length} items)`),
    );
    console.log(
      color.dim(`via ${proposal.providerId} · not yet added - re-run with --apply to append`),
    );
    console.log("");
    proposal.items.forEach((t, i) => {
      console.log(`  ${color.dim(String(i + 1).padStart(2) + ".")} ${t}`);
    });
    console.log("");
    console.log(
      indent(`${symbol.arrow()} Apply: ${color.bold(`vibe tasks enhance ${taskId} --apply`)}`),
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdSuggest(opts: { json?: boolean; all?: boolean }): Promise<number> {
  const { svc: s } = await svc();
  await s.init();
  const suggestions = await s.suggestNext();
  if (opts.json) {
    console.log(JSON.stringify(suggestions, null, 2));
    return 0;
  }
  if (suggestions.length === 0) {
    console.log("No backlog cards to suggest. Add one or mark a task ready.");
    return 0;
  }
  const shown = opts.all ? suggestions : suggestions.slice(0, 5);
  console.log(header("Suggested next"));
  console.log("");
  shown.forEach((sg, i) => {
    const marker = sg.ready ? symbol.ok() : color.dim("·");
    console.log(`${color.dim(String(i + 1).padStart(2) + ".")} ${marker} ${color.bold(sg.title)} ${color.dim(`(${sg.taskId})`)}`);
    console.log(indent(color.dim(sg.reason)));
  });
  if (!opts.all && suggestions.length > shown.length) {
    console.log("");
    console.log(color.dim(`  …and ${suggestions.length - shown.length} more (--all to show).`));
  }
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

async function cmdArchive(taskId: string, archived: boolean): Promise<number> {
  try {
    const { svc: s } = await svc();
    await s.setArchived(taskId, archived);
    console.log(
      `${symbol.ok()} Task ${color.bold(taskId)} ${archived ? "archived" : "un-archived"}.`,
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdDelete(taskId: string, yes: boolean): Promise<number> {
  try {
    const { svc: s } = await svc();
    const t = await s.getTask(taskId);
    if (!t) {
      console.error(`${symbol.fail()} Task "${taskId}" not found.`);
      return 1;
    }
    if (!yes) {
      const { confirm } = await import("@inquirer/prompts");
      const ok = await confirm({
        message: `Permanently remove task "${t.title}" (${taskId})? This deletes the card and its comments. Runs, transcripts, and the git worktree (if any) are left in place.`,
        default: false,
      });
      if (!ok) {
        console.log("Aborted.");
        return 0;
      }
    }
    const deleted = await s.deleteTask(taskId);
    console.log(`${symbol.ok()} Removed task ${color.bold(taskId)}.`);
    if (deleted.worktreePath) {
      console.log(
        `  Its git worktree was left in place: ${deleted.worktreePath}`,
      );
    }
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
        `${symbol.arrow()} Start the scheduler: ${color.bold("vibe queue run")}`,
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
      // proposals dir absent - fine
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

export async function cmdRun(taskId: string): Promise<number> {
  // Foreground: spawn `vibe run --task <id>` against the local CLI bin so the
  // user sees progress live and the orchestrator handles task linkage.
  const { svc: s, root } = await svc();
  const task = await s.getTask(taskId);
  if (!task) {
    console.error(`${symbol.fail()} Task "${taskId}" not found.`);
    return 1;
  }
  // A supervised task SEQUENCES its steps (the Conductor) rather than running the
  // default flow once. cmdSequence runs foreground in-process, so delegate to it.
  if (task.runMode === "supervised") {
    return cmdSequence(taskId, {});
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

async function cmdPickup(
  taskId: string,
  opts: { step?: boolean },
): Promise<number> {
  const { svc: s, root } = await svc();
  const task = await s.getTask(taskId);
  if (!task) {
    console.error(`${symbol.fail()} Task "${taskId}" not found.`);
    return 1;
  }
  if (task.checklist.length === 0) {
    console.error(
      `${symbol.fail()} Task "${taskId}" has no checklist. Add items (vibe tasks checklist add) or run "vibe tasks enhance ${taskId}" first.`,
    );
    return 2;
  }
  const { fileURLToPath } = await import("node:url");
  const fs = await import("node:fs");
  // Re-invoke the exact entrypoint this process was launched with - robust
  // whether the CLI ships as a single bundle or a tsc-compiled tree.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bin =
    [
      process.argv[1],
      path.resolve(here, "..", "..", "..", "dist", "index.js"),
      path.resolve(here, "..", "..", "index.js"),
    ].find((p) => p && fs.existsSync(p)) ?? null;
  if (!bin) {
    console.error(
      `${symbol.fail()} Could not locate the Vibestrate CLI entrypoint.`,
    );
    return 1;
  }
  const mode = opts.step ? "step" : "continuous";
  console.log(
    `${symbol.arrow()} Picking up ${color.bold(task.title)} - ${task.checklist.length} item(s), ${mode} mode.`,
  );
  return new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [bin, "run", task.title, "--task", task.id, "--flow", "pickup", "--checklist", mode],
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
      "--provider <id>",
      "override the provider for runs spawned from this task.",
    )
    .option(
      "--read-only",
      "investigation-only: runs spawned from this task skip executor + fix loop and refuse apply/validate/revert.",
    )
    .option(
      "--supervised",
      "create a supervised task: its steps are sequenced by the Conductor (per-step review, supervisor, budget, clean-halt) instead of running once.",
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
    .command("suggest")
    .description("Suggest which backlog card to pick up next (ready + priority).")
    .option("--all", "show the full ranked backlog, not just the top few")
    .option("--json", "emit JSON")
    .action(async (opts) => {
      process.exit(await cmdSuggest(opts));
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
    .command("archive <id>")
    .description("Archive a task (files it into the board's Archived column).")
    .action(async (id: string) => {
      process.exit(await cmdArchive(id, true));
    });

  cmd
    .command("unarchive <id>")
    .description("Un-archive a task.")
    .action(async (id: string) => {
      process.exit(await cmdArchive(id, false));
    });

  cmd
    .command("delete <id>")
    .description(
      "Permanently remove a task card (refuses while its run is live).",
    )
    .option("-y, --yes", "skip the confirmation prompt")
    .action(async (id: string, opts: { yes?: boolean }) => {
      process.exit(await cmdDelete(id, opts.yes ?? false));
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
    .description(
      "Run this task now (foreground). A supervised task sequences its steps (the Conductor); a plain task runs the default flow once.",
    )
    .action(async (id: string) => {
      const code = await cmdRun(id);
      process.exit(code);
    });

  // ── Supervised run (the Conductor) ──────────────────────────────────────────
  cmd
    .command("sequence <id>")
    .description(
      "Sequence a supervised task's steps in order (the Conductor). The stable entry the scheduler spawns; `run` delegates here for supervised tasks.",
    )
    .option("--json", "emit JSON")
    .action(async (id: string, opts) => {
      process.exit(await cmdSequence(id, opts));
    });
  cmd
    .command("status <id>")
    .description("Show a supervised task's live conductor status (lifecycle, steps, invariants, halt).")
    .option("--json", "emit JSON")
    .action(async (id: string, opts) => {
      process.exit(await cmdStatus(id, opts));
    });
  cmd
    .command("pause <id>")
    .description("Pause a supervised task's live run (between steps).")
    .action(async (id: string) => {
      process.exit(await cmdPause(id));
    });
  cmd
    .command("resume <id>")
    .description("Resume a paused supervised task, or re-sequence a halted one from the clean tip.")
    .action(async (id: string) => {
      process.exit(await cmdResume(id));
    });

  cmd
    .command("pickup <id>")
    .description(
      "Execute the task's checklist item-by-item (pick-up flow). Continuous by default; --step pauses between items.",
    )
    .option("--step", "pause between items for review (step-by-step)")
    .action(async (id: string, opts) => {
      const code = await cmdPickup(id, opts);
      process.exit(code);
    });

  const checklist = new Command("checklist").description(
    "Manage a task's in-card checklist (the ordered breakdown of items).",
  );
  checklist
    .command("list <taskId>")
    .description("List a task's checklist items.")
    .option("--json", "emit JSON")
    .action(async (taskId: string, opts) => {
      process.exit(await cmdChecklistList(taskId, opts));
    });
  checklist
    .command("add <taskId> <text...>")
    .description("Append a checklist item (a step). Add --objective/--acceptance/--files to author a structured step for a supervised task.")
    .option("--objective <text>", "the scoped brief an executor receives for this step")
    .option("--acceptance <text>", "plain-language done-when check for this step")
    .option("--files <list>", "comma-separated file hints (primary context for this step)")
    .action(async (taskId: string, text: string[], opts) => {
      process.exit(await cmdChecklistAdd(taskId, text.join(" "), opts));
    });
  checklist
    .command("check <taskId> <itemId>")
    .description("Mark a checklist item done.")
    .action(async (taskId: string, itemId: string) => {
      process.exit(await cmdChecklistStatus(taskId, itemId, "done"));
    });
  checklist
    .command("uncheck <taskId> <itemId>")
    .description("Reset a checklist item to pending.")
    .action(async (taskId: string, itemId: string) => {
      process.exit(await cmdChecklistStatus(taskId, itemId, "pending"));
    });
  checklist
    .command("status <taskId> <itemId> <status>")
    .description("Set an item status: pending | in_progress | done | blocked.")
    .action(async (taskId: string, itemId: string, status: string) => {
      const allowed: ChecklistItemStatus[] = [
        "pending",
        "in_progress",
        "done",
        "blocked",
      ];
      if (!allowed.includes(status as ChecklistItemStatus)) {
        console.error(
          `${symbol.fail()} status must be one of: ${allowed.join(" | ")}.`,
        );
        process.exit(2);
      }
      process.exit(
        await cmdChecklistStatus(taskId, itemId, status as ChecklistItemStatus),
      );
    });
  checklist
    .command("edit <taskId> <itemId> <text...>")
    .description("Edit a checklist item's text.")
    .action(async (taskId: string, itemId: string, text: string[]) => {
      process.exit(await cmdChecklistEdit(taskId, itemId, text.join(" ")));
    });
  checklist
    .command("remove <taskId> <itemId>")
    .description("Remove a checklist item.")
    .action(async (taskId: string, itemId: string) => {
      process.exit(await cmdChecklistRemove(taskId, itemId));
    });
  checklist
    .command("move <taskId> <itemId> <position>")
    .description("Move a checklist item to a 1-based position.")
    .action(async (taskId: string, itemId: string, position: string) => {
      process.exit(await cmdChecklistMove(taskId, itemId, position));
    });
  checklist
    .command("promote <taskId> <itemId>")
    .description("Promote a checklist item to its own card (keeps a derived-from link).")
    .action(async (taskId: string, itemId: string) => {
      process.exit(await cmdChecklistPromote(taskId, itemId));
    });
  cmd.addCommand(checklist);

  cmd
    .command("enhance <id>")
    .description(
      "Propose a checklist for a task with an AI assist (read-only). Add --apply to append the items.",
    )
    .option("--apply", "append the proposed items to the task's checklist")
    .option("--profile <id>", "profile to run the assist on (default: crew planner)")
    .option("--json", "emit JSON")
    .action(async (id: string, opts) => {
      process.exit(await cmdEnhance(id, opts));
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
