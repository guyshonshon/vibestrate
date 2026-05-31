import path from "node:path";
import { Command } from "commander";
import { WorkspaceStore, type WorkspaceProject } from "../../workspace/workspace-store.js";
import {
  buildWorkspaceOverview,
  type OverviewRange,
  type ProjectRegistryEntry,
} from "../../workspace/workspace-overview.js";
import {
  launchRunInProject,
  abortRunInProject,
  workspaceRunRequestSchema,
  type WorkspaceRunRequest,
} from "../../workspace/workspace-coordinator.js";
import {
  WorkspaceQueueStore,
  drainWorkspaceQueue,
} from "../../workspace/workspace-queue.js";
import { WorkspaceSafetyError } from "../../workspace/workspace-safety.js";
import { pathExists } from "../../utils/fs.js";
import { vibestrateRoot } from "../../utils/paths.js";
import { color, header, indent, symbol } from "../ui/format.js";

function resolveSelector(
  projects: WorkspaceProject[],
  selector: string,
): WorkspaceProject | null {
  const abs = path.resolve(selector);
  return (
    projects.find((p) => p.root === abs) ??
    projects.find((p) => p.label === selector) ??
    null
  );
}

async function cmdList(opts: { json?: boolean }): Promise<number> {
  const projects = await new WorkspaceStore().list();
  if (opts.json) {
    console.log(JSON.stringify(projects, null, 2));
    return 0;
  }
  if (projects.length === 0) {
    console.log("No projects registered yet.");
    console.log(indent(color.dim("Run `vibe ui` in a project, or `vibe workspace add`.")));
    return 0;
  }
  console.log(header(`Workspace projects (${projects.length})`));
  console.log("");
  for (const p of projects) {
    console.log(`${color.bold(p.label)} ${color.dim(p.root)}`);
    const where = p.lastPort ? `last at http://localhost:${p.lastPort}` : "not yet started";
    console.log(indent(color.dim(`${where} · opened ${p.lastOpenedAt}`)));
  }
  return 0;
}

async function cmdAdd(target: string | undefined): Promise<number> {
  const root = path.resolve(target ?? process.cwd());
  if (!(await pathExists(root))) {
    console.error(`${symbol.fail()} Path does not exist: ${root}`);
    return 1;
  }
  const entry = await new WorkspaceStore().register({ root });
  const initialized = await pathExists(vibestrateRoot(root));
  console.log(`${symbol.ok()} Registered ${color.bold(entry.label)} (${entry.root}).`);
  if (!initialized) {
    console.log(indent(color.dim("Note: no .vibestrate/ here yet — run `vibe init` in it.")));
  }
  return 0;
}

async function cmdRemove(selector: string): Promise<number> {
  const store = new WorkspaceStore();
  const projects = await store.list();
  const match = resolveSelector(projects, selector);
  const root = match?.root ?? path.resolve(selector);
  const removed = await store.remove(root);
  if (!removed) {
    console.error(`${symbol.fail()} No registered project matches "${selector}".`);
    return 1;
  }
  console.log(`${symbol.ok()} Removed ${color.bold(match?.label ?? selector)} from the workspace (project on disk untouched).`);
  return 0;
}

async function cmdOpen(selector: string): Promise<number> {
  const projects = await new WorkspaceStore().list();
  const match = resolveSelector(projects, selector);
  if (!match) {
    console.error(`${symbol.fail()} No registered project matches "${selector}".`);
    return 1;
  }
  if (match.lastPort) {
    console.log(
      `${symbol.arrow()} ${color.bold(match.label)}: open ${color.bold(`http://localhost:${match.lastPort}`)} (if its dashboard is still running).`,
    );
  }
  console.log(
    indent(`Start it: ${color.bold(`cd ${match.root} && vibe ui`)}`),
  );
  return 0;
}

const RANGES = new Set<OverviewRange>(["24h", "7d", "30d", "90d"]);

/** Registered projects + the current directory (marked current), like the API. */
async function overviewEntries(): Promise<ProjectRegistryEntry[]> {
  const current = path.resolve(process.cwd());
  const projects = await new WorkspaceStore().list();
  const entries: ProjectRegistryEntry[] = projects.map((p) => ({
    root: p.root,
    label: p.label,
    current: p.root === current,
    lastPort: p.lastPort,
    lastOpenedAt: p.lastOpenedAt,
  }));
  if (!entries.some((e) => e.root === current)) {
    entries.unshift({
      root: current,
      label: path.basename(current) || current,
      current: true,
      lastPort: null,
      lastOpenedAt: null,
    });
  }
  return entries;
}

async function cmdOverview(opts: {
  range?: string;
  json?: boolean;
}): Promise<number> {
  const range = (opts.range ?? "7d") as OverviewRange;
  if (!RANGES.has(range)) {
    console.error(`${symbol.fail()} Invalid range "${opts.range}" (use 24h|7d|30d|90d).`);
    return 1;
  }
  const overview = await buildWorkspaceOverview({
    projects: await overviewEntries(),
    range,
  });
  if (opts.json) {
    console.log(JSON.stringify(overview, null, 2));
    return 0;
  }
  const { totals } = overview;
  console.log(header(`All projects · last ${range}`));
  console.log(
    indent(
      color.dim(
        `${totals.projects} projects · ${totals.activeRuns} active · ${totals.windowRuns} runs · ` +
          `${totals.merged} merged · ${totals.failed} failed · ` +
          `$${totals.costUsd.toFixed(2)} · ${totals.tokens.toLocaleString()} tok`,
      ),
    ),
  );
  console.log("");
  if (overview.projects.length === 0) {
    console.log(indent(color.dim("No projects registered. Run `vibe ui` in one, or `vibe workspace add`.")));
    return 0;
  }
  for (const p of overview.projects) {
    const tag = p.current ? color.dim(" (current)") : "";
    const flags: string[] = [];
    if (!p.initialized) flags.push("not initialized");
    if (p.unreadable) flags.push("unreadable");
    console.log(`${color.bold(p.label)}${tag} ${color.dim(p.root)}`);
    const stats =
      `${p.activeRuns} active · ${p.window.runs} runs/${range} · ` +
      `${p.window.merged} merged · ${p.window.failed} failed · ` +
      `$${p.window.costUsd.toFixed(2)}` +
      (p.needsTesting > 0 ? ` · ${p.needsTesting} need testing` : "") +
      (flags.length > 0 ? ` · ${flags.join(", ")}` : "");
    console.log(indent(color.dim(stats)));
  }
  return 0;
}

// ── Cross-project run / abort / queue (slices c-board + d) ──────────────────

type RunOpts = {
  project?: string;
  task?: string;
  effort?: string;
  crew?: string;
  profile?: string;
  readOnly?: boolean;
  flow?: string;
  flowBrief?: string;
  checklist?: string;
  skills?: string;
};

/** Build + validate a cross-project run request from CLI options. Throws a
 *  WorkspaceSafetyError-shaped message string on a missing project. */
function buildRunRequest(task: string, opts: RunOpts): WorkspaceRunRequest {
  if (!opts.project) {
    throw new WorkspaceSafetyError("`--project <path|label>` is required.");
  }
  const req = {
    project: opts.project,
    task,
    taskId: opts.task ?? null,
    effort: (opts.effort as "low" | "medium" | "high" | undefined) ?? null,
    crewId: opts.crew ?? null,
    profileOverride: opts.profile ?? null,
    readOnly: opts.readOnly ?? false,
    checklistMode: (opts.checklist as "continuous" | "step" | undefined) ?? null,
    skills: opts.skills
      ? opts.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    flow: opts.flow
      ? { id: opts.flow, brief: opts.flowBrief ?? null }
      : null,
  };
  const parsed = workspaceRunRequestSchema.safeParse(req);
  if (!parsed.success) {
    throw new WorkspaceSafetyError(parsed.error.issues[0]?.message ?? "Invalid run request.");
  }
  return parsed.data;
}

async function cmdRun(task: string, opts: RunOpts): Promise<number> {
  try {
    const req = buildRunRequest(task, opts);
    const result = await launchRunInProject(req, { currentRoot: process.cwd() });
    console.log(
      `${symbol.ok()} Launched in ${color.bold(result.label)} ${color.dim(result.root)}`,
    );
    console.log(indent(color.dim(result.message)));
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdAbort(runId: string, opts: { project?: string }): Promise<number> {
  if (!opts.project) {
    console.error(`${symbol.fail()} \`--project <path|label>\` is required.`);
    return 1;
  }
  try {
    const r = await abortRunInProject(
      { project: opts.project, runId },
      { currentRoot: process.cwd() },
    );
    if (r.alreadyTerminal) {
      console.log(`${symbol.arrow()} ${runId} in ${color.bold(r.label)} was already ${r.status}.`);
    } else {
      console.log(`${symbol.ok()} Aborted ${runId} in ${color.bold(r.label)}.`);
    }
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdQueueList(opts: { json?: boolean }): Promise<number> {
  const entries = await new WorkspaceQueueStore().list();
  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return 0;
  }
  if (entries.length === 0) {
    console.log("Workspace queue is empty.");
    console.log(indent(color.dim("Add one with `vibe workspace queue add <task> --project <sel>`.")));
    return 0;
  }
  console.log(header(`Workspace queue (${entries.length})`));
  console.log("");
  for (const e of entries) {
    console.log(`${color.bold(e.request.project)} ${color.dim(`· ${e.source} · ${e.enqueuedAt}`)}`);
    const tags = [
      e.request.flow ? `flow:${e.request.flow.id}` : null,
      e.request.effort ? `effort:${e.request.effort}` : null,
      e.request.readOnly ? "read-only" : null,
    ].filter(Boolean);
    console.log(indent(`${e.request.task}${tags.length ? color.dim(`  [${tags.join(" ")}]`) : ""}`));
    console.log(indent(color.dim(`id ${e.id}`)));
  }
  return 0;
}

async function cmdQueueAdd(task: string, opts: RunOpts): Promise<number> {
  try {
    const req = buildRunRequest(task, opts);
    const entry = await new WorkspaceQueueStore().enqueue(req, "user");
    console.log(`${symbol.ok()} Queued for ${color.bold(req.project)} ${color.dim(`(id ${entry.id})`)}.`);
    console.log(indent(color.dim("Drain it with `vibe workspace queue drain`.")));
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdQueueDrain(opts: {
  maxConcurrent?: string;
  maxPerProject?: string;
  json?: boolean;
}): Promise<number> {
  const result = await drainWorkspaceQueue({
    currentRoot: process.cwd(),
    spawnedBy: "workspace-cli-drain",
    maxConcurrent: opts.maxConcurrent ? Number(opts.maxConcurrent) : undefined,
    maxPerProject: opts.maxPerProject ? Number(opts.maxPerProject) : undefined,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  console.log(
    `${symbol.ok()} Launched ${color.bold(String(result.launched.length))}, ` +
      `skipped ${result.skipped.length}, ${result.remaining} still queued.`,
  );
  for (const l of result.launched) {
    console.log(indent(`${color.dim("▸")} ${l.label}: ${l.message}`));
  }
  for (const s of result.skipped) {
    console.log(indent(color.dim(`× ${s.project}: ${s.detail}`)));
  }
  return 0;
}

async function cmdQueueRemove(id: string): Promise<number> {
  const removed = await new WorkspaceQueueStore().remove(id);
  if (!removed) {
    console.error(`${symbol.fail()} No queued entry with id "${id}".`);
    return 1;
  }
  console.log(`${symbol.ok()} Removed ${id} from the workspace queue.`);
  return 0;
}

async function cmdQueueClear(): Promise<number> {
  const n = await new WorkspaceQueueStore().clear();
  console.log(`${symbol.ok()} Cleared ${n} queued ${n === 1 ? "entry" : "entries"}.`);
  return 0;
}

function addRunOptions(cmd: Command): Command {
  return cmd
    .option("--project <pathOrLabel>", "target project (registered path or label)")
    .option("--task <id>", "link to an existing roadmap task id")
    .option("--effort <level>", "low|medium|high")
    .option("--crew <id>", "crew to resolve the flow against")
    .option("--profile <id>", "run-wide profile override")
    .option("--read-only", "investigation-only run (no apply/validate/revert)")
    .option("--flow <id>", "run a specific flow")
    .option("--flow-brief <text>", "brief passed to the flow")
    .option("--checklist <mode>", "continuous|step (iterate the task checklist)")
    .option("--skills <csv>", "comma-separated skill ids for this run");
}

export function buildWorkspaceCommand(): Command {
  const cmd = new Command("workspace").description(
    "Track + switch between multiple Vibestrate projects (a user-level registry).",
  );
  cmd
    .command("list")
    .description("List registered projects (most recently opened first).")
    .option("--json", "emit JSON")
    .action(async (opts) => process.exit(await cmdList(opts)));
  cmd
    .command("add [path]")
    .description("Register a project directory (default: the current directory).")
    .action(async (target?: string) => process.exit(await cmdAdd(target)));
  cmd
    .command("remove <pathOrLabel>")
    .description("Remove a project from the workspace registry (leaves it on disk).")
    .action(async (selector: string) => process.exit(await cmdRemove(selector)));
  cmd
    .command("open <pathOrLabel>")
    .description("Show how to open a registered project's dashboard.")
    .action(async (selector: string) => process.exit(await cmdOpen(selector)));
  cmd
    .command("overview")
    .description("Cross-project rollup: runs + cost across every registered project.")
    .option("--range <range>", "window: 24h|7d|30d|90d", "7d")
    .option("--json", "emit JSON")
    .action(async (opts) => process.exit(await cmdOverview(opts)));

  // Cross-project run (slice c-board): launch a run in another registered project.
  addRunOptions(
    cmd
      .command("run <task>")
      .description("Launch a run in a registered project (cross-project)."),
  ).action(async (task: string, opts: RunOpts) => process.exit(await cmdRun(task, opts)));

  cmd
    .command("abort <runId>")
    .description("Abort a run in a registered project (cross-project).")
    .option("--project <pathOrLabel>", "the project the run belongs to")
    .action(async (runId: string, opts: { project?: string }) =>
      process.exit(await cmdAbort(runId, opts)),
    );

  // Cross-project dispatch queue (slice d).
  const queue = new Command("queue").description(
    "Cross-project run queue — enqueue intents and drain them with concurrency caps.",
  );
  queue
    .command("list")
    .description("List queued cross-project runs (FIFO).")
    .option("--json", "emit JSON")
    .action(async (opts) => process.exit(await cmdQueueList(opts)));
  addRunOptions(
    queue
      .command("add <task>")
      .description("Queue a run for a registered project."),
  ).action(async (task: string, opts: RunOpts) => process.exit(await cmdQueueAdd(task, opts)));
  queue
    .command("drain")
    .description("Launch eligible queued runs (respects global + per-project caps).")
    .option("--max-concurrent <n>", "global concurrency cap (default 2)")
    .option("--max-per-project <n>", "per-project concurrency cap (default 1)")
    .option("--json", "emit JSON")
    .action(async (opts) => process.exit(await cmdQueueDrain(opts)));
  queue
    .command("remove <id>")
    .description("Remove a queued entry by id.")
    .action(async (id: string) => process.exit(await cmdQueueRemove(id)));
  queue
    .command("clear")
    .description("Clear the whole workspace queue.")
    .action(async () => process.exit(await cmdQueueClear()));
  cmd.addCommand(queue);

  return cmd;
}
