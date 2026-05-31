import path from "node:path";
import { exec } from "node:child_process";
import { Command } from "commander";
import {
  WorkspaceStore,
  canonicalRoot,
  type WorkspaceProject,
} from "../../workspace/workspace-store.js";
import {
  buildWorkspaceOverview,
  type OverviewRange,
  type ProjectRegistryEntry,
} from "../../workspace/workspace-overview.js";
import {
  ensureProjectServer,
  probeLiveness,
} from "../../workspace/workspace-runtime.js";
import { pathExists } from "../../utils/fs.js";
import { vibestrateRoot } from "../../utils/paths.js";
import { color, header, indent, symbol } from "../ui/format.js";

function resolveSelector(
  projects: WorkspaceProject[],
  selector: string,
): WorkspaceProject | null {
  const abs = canonicalRoot(selector);
  return (
    projects.find((p) => p.root === abs) ??
    projects.find((p) => p.label === selector) ??
    null
  );
}

/** Open a URL in the user's default browser (best-effort). */
function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open ${JSON.stringify(url)}`
      : platform === "win32"
        ? `start "" ${JSON.stringify(url)}`
        : `xdg-open ${JSON.stringify(url)}`;
  exec(cmd, () => {
    /* ignore — the URL is printed for copy/paste */
  });
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
  const liveness = await probeLiveness(projects);
  console.log(header(`Workspace projects (${projects.length})`));
  console.log("");
  for (const p of projects) {
    const live = liveness[p.root];
    const dot = live ? color.green("●") : color.dim("○");
    console.log(`${dot} ${color.bold(p.label)} ${color.dim(p.root)}`);
    const where = live
      ? `live at http://localhost:${p.lastPort}`
      : p.lastPort
        ? `last at http://localhost:${p.lastPort} (dormant)`
        : "not yet started";
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

/**
 * Open a project's dashboard — starting its own `vibe ui` (server + scheduler)
 * if it isn't already live, then opening a browser tab. Each project stays a
 * fully isolated tenant; this just navigates to it.
 */
async function cmdOpen(
  selector: string,
  opts: { open?: boolean },
): Promise<number> {
  try {
    const r = await ensureProjectServer(
      { project: selector },
      { currentRoot: process.cwd() },
    );
    const how = r.started ? "started + opening" : "already live";
    console.log(
      `${symbol.ok()} ${color.bold(r.label)} — ${color.bold(r.url)} ${color.dim(`(${how})`)}`,
    );
    if (opts.open !== false) openBrowser(r.url);
    return 0;
  } catch (err) {
    console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** Bring every registered project live (and optionally open each tab). */
async function cmdOpenAll(opts: { open?: boolean }): Promise<number> {
  const projects = await new WorkspaceStore().list();
  if (projects.length === 0) {
    console.log("No projects registered yet.");
    return 0;
  }
  let failures = 0;
  for (const p of projects) {
    try {
      const r = await ensureProjectServer(
        { project: p.root },
        { currentRoot: process.cwd() },
      );
      console.log(
        `${r.started ? symbol.ok() : symbol.arrow()} ${color.bold(r.label)} ${color.dim(r.url)}`,
      );
      if (opts.open !== false) openBrowser(r.url);
    } catch (err) {
      failures += 1;
      console.error(`${symbol.fail()} ${p.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failures > 0 ? 1 : 0;
}

const RANGES = new Set<OverviewRange>(["24h", "7d", "30d", "90d"]);

/** Registered projects + the current directory (marked current), like the API. */
async function overviewEntries(): Promise<ProjectRegistryEntry[]> {
  const current = canonicalRoot(process.cwd());
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
  const entries = await overviewEntries();
  const overview = await buildWorkspaceOverview({ projects: entries, range });
  const liveness = await probeLiveness(
    entries.map((e) => ({ root: e.root, lastPort: e.lastPort })),
  );
  for (const p of overview.projects) {
    p.live = p.current ? true : (liveness[p.root] ?? false);
  }
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
    const dot = p.live ? color.green("●") : color.dim("○");
    const tag = p.current ? color.dim(" (current)") : "";
    const flags: string[] = [];
    if (!p.initialized) flags.push("not initialized");
    if (p.unreadable) flags.push("unreadable");
    if (!p.live && !p.current) flags.push("dormant");
    console.log(`${dot} ${color.bold(p.label)}${tag} ${color.dim(p.root)}`);
    const stats =
      `${p.activeRuns} active · ${p.window.runs} runs/${range} · ` +
      `${p.window.merged} merged · ${p.window.failed} failed · ` +
      `$${p.window.costUsd.toFixed(2)}` +
      (p.needsTesting > 0 ? ` · ${p.needsTesting} need testing` : "") +
      (flags.length > 0 ? ` · ${flags.join(", ")}` : "");
    console.log(indent(color.dim(stats)));
  }
  console.log("");
  console.log(indent(color.dim("Open one: `vibe workspace open <label>` (starts it if dormant).")));
  return 0;
}

export function buildWorkspaceCommand(): Command {
  const cmd = new Command("workspace").description(
    "Track + switch between multiple Vibestrate projects (a user-level registry).",
  );
  cmd
    .command("list")
    .description("List registered projects (live ● / dormant ○).")
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
    .command("open [pathOrLabel]")
    .description("Open a project's dashboard, starting it (server + scheduler) if dormant.")
    .option("--all", "open every registered project")
    .option("--no-open", "start the dashboard(s) but don't open a browser tab")
    .action(async (selector: string | undefined, opts: { all?: boolean; open?: boolean }) => {
      if (opts.all) return process.exit(await cmdOpenAll(opts));
      if (!selector) {
        console.error(`${symbol.fail()} Provide a project (path or label), or use --all.`);
        return process.exit(1);
      }
      return process.exit(await cmdOpen(selector, opts));
    });
  cmd
    .command("overview")
    .description("Cross-project rollup: runs + cost across every registered project.")
    .option("--range <range>", "window: 24h|7d|30d|90d", "7d")
    .option("--json", "emit JSON")
    .action(async (opts) => process.exit(await cmdOverview(opts)));
  return cmd;
}
