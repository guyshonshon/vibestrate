import path from "node:path";
import { Command } from "commander";
import { WorkspaceStore, type WorkspaceProject } from "../../workspace/workspace-store.js";
import {
  buildWorkspaceOverview,
  type OverviewRange,
  type ProjectRegistryEntry,
} from "../../workspace/workspace-overview.js";
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
  return cmd;
}
