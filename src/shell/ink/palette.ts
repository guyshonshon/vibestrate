// Pure command-palette catalog + fuzzy filter. The view layer renders
// the filtered list; the executor dispatches the chosen command.
//
// Commands are intentionally string-keyed so future phases can add
// entries without touching the dispatcher (which lives next to the
// runtime).

import type { PageId } from "./ui-state.js";

export type PaletteCommand = {
  id: string;
  title: string;
  /** Short hint, shown after the title in the palette list. */
  hint?: string;
  /** Keywords the fuzzy filter matches against in addition to title. */
  keywords?: string[];
  /**
   * Longer description shown in the details pane when the command
   * is highlighted. Teach intent + side-effects in one paragraph.
   */
  description?: string;
  /**
   * Equivalent CLI invocation (or the CLI surface the command
   * touches). Shown in the details pane so the user learns the
   * terminal-only path.
   */
  cli?: string;
  /**
   * Short examples illustrating useful invocations / flags. Each
   * entry is a single line, rendered in the details pane.
   */
  examples?: string[];
  /**
   * What the runtime should do when the command fires. Kept abstract
   * here so this module stays import-free.
   */
  action:
    | { kind: "goto"; page: PageId }
    | { kind: "pause-run" }
    | { kind: "resume-run" }
    | { kind: "abort-run" }
    | { kind: "open-help" }
    | { kind: "quit" }
    | { kind: "pause-scheduler" }
    | { kind: "resume-scheduler" }
    | { kind: "open-runner"; seed?: string }
    | { kind: "spawn-detached"; argv: string[]; toast?: string }
    | { kind: "open-url"; url: string };
};

export const DEFAULT_PALETTE: PaletteCommand[] = [
  {
    id: "goto.dashboard",
    title: "Go to Dashboard",
    hint: "overview of active runs, queue, approvals",
    keywords: ["home", "overview"],
    description:
      "At-a-glance project view: active runs, queue depth, pending approvals + suggestions, recent activity across all runs.",
    cli: "(panel only — no CLI equivalent yet)",
    action: { kind: "goto", page: "dashboard" },
  },
  {
    id: "goto.runs",
    title: "Go to Runs",
    hint: "list + inspector for every run",
    description:
      "Browse, inspect, and control runs. Right pane shows the selected run's events / overview / validation.",
    cli: "amaco status",
    examples: [
      'amaco run "fix login bug"          # start a new run',
      "amaco replay <runId>                # event-by-event replay",
      "amaco pause <runId>                 # pause at next safe stage",
    ],
    action: { kind: "goto", page: "runs" },
  },
  {
    id: "goto.roadmap",
    title: "Go to Roadmap",
    hint: "kanban board + task CRUD",
    keywords: ["tasks", "board"],
    description:
      "Workflow board grouped by task status. Navigate states with ←/→, tasks with ↑/↓; n creates, e edits, d deletes, Q queues.",
    cli: "amaco tasks list",
    examples: [
      'amaco tasks add "title" --priority high --effort medium',
      "amaco tasks show <taskId>",
      "amaco roadmap show                  # raw roadmap document",
    ],
    action: { kind: "goto", page: "roadmap" },
  },
  {
    id: "goto.queue",
    title: "Go to Queue",
    hint: "scheduler + fairness controls",
    keywords: ["scheduler"],
    description:
      "FIFO + priority + fairness queue. Each entry carries a source tag for per-source quotas.",
    cli: "amaco queue list",
    examples: [
      "amaco queue add <taskId> --source cron",
      "amaco queue run                     # drain the queue",
      "amaco queue status                  # current scheduler state",
    ],
    action: { kind: "goto", page: "queue" },
  },
  {
    id: "goto.agents",
    title: "Go to Agents",
    hint: "agents + provider + MCP servers",
    description:
      "Configured agents (planner, architect, executor, …) with their provider, prompt path, permissions, and attached MCP servers.",
    cli: "(panel only — managed via .amaco/project.yml)",
    action: { kind: "goto", page: "agents" },
  },
  {
    id: "goto.skills",
    title: "Go to Skills",
    hint: "discovered skills + MCP attachment",
    keywords: ["mcp"],
    description:
      "Discover amaco / claude / user skills, see their MCP server declarations, attach them to agents.",
    cli: "amaco skills list",
    examples: [
      "amaco skills show <id>              # show frontmatter + body",
      "amaco skills assign <id> <agent>    # attach skill to agent",
    ],
    action: { kind: "goto", page: "skills" },
  },
  {
    id: "runner.guides-list",
    title: "List Guides",
    hint: "inspect built-in and project run recipes",
    keywords: ["recipes", "quality", "arbitration", "workflow"],
    description:
      "Opens the command runner with the Guide catalog so the shell can inspect the same run recipes as the CLI and dashboard.",
    cli: "amaco guides list",
    examples: [
      "amaco guides show quality-arbitration",
      'amaco run "review this change" --guide quality-arbitration',
    ],
    action: { kind: "open-runner", seed: "guides list" },
  },
  {
    id: "runner.guides-quality-arbitration",
    title: "Show Quality Arbitration Guide",
    hint: "slots + ordered review steps",
    keywords: ["guide", "review", "challenger", "cto"],
    description:
      "Loads the built-in Quality Arbitration Guide definition in the runner before the sequential Guide runner phase.",
    cli: "amaco guides show quality-arbitration",
    action: {
      kind: "open-runner",
      seed: "guides show quality-arbitration",
    },
  },
  {
    id: "goto.approvals",
    title: "Go to Approvals",
    hint: "pending approval gates",
    description:
      "Approve or reject every pending approval across runs. Use this when a run pauses at a policy-required boundary.",
    cli: "amaco approvals list",
    examples: [
      "amaco approvals show <id>",
      "amaco approvals accept <id>",
      'amaco approvals reject <id> --reason "needs migration"',
    ],
    action: { kind: "goto", page: "approvals" },
  },
  {
    id: "goto.suggestions",
    title: "Go to Suggestions",
    hint: "per-run suggestions + bundles",
    keywords: ["bundles"],
    description:
      "Accept / reject suggestions per run; apply bundles, validate, revert. The same surface area as amaco suggestions / bundles.",
    cli: "amaco suggestions list",
    examples: [
      "amaco suggestions show <id>",
      "amaco bundles apply <bundleId>",
      "amaco bundles revert <bundleId>",
    ],
    action: { kind: "goto", page: "suggestions" },
  },
  {
    id: "goto.notifications",
    title: "Go to Notifications",
    hint: "feed + gateway status",
    description:
      "Recent notifications across runs + the health of each configured gateway (CLI, in-app, webhook, Discord, Slack, Telegram).",
    cli: "amaco notifications list",
    examples: ["amaco notifications gateways"],
    action: { kind: "goto", page: "notifications" },
  },
  {
    id: "goto.doctor",
    title: "Go to Doctor",
    hint: "env + config diagnostics",
    keywords: ["settings", "diagnostics"],
    description:
      "Run the same checks as `amaco doctor` inline, with a one-click --fix surface for safe recoveries.",
    cli: "amaco doctor",
    examples: [
      "amaco doctor --fix                  # apply safe scaffold fixes",
      "amaco doctor --json                 # JSON for scripting",
    ],
    action: { kind: "goto", page: "doctor" },
  },
  {
    id: "scheduler.start",
    title: "Start scheduler loop",
    hint: "spawns `amaco queue run` in the background",
    keywords: ["queue", "start", "daemon", "poll"],
    description:
      "Boots the scheduler loop so queued tasks actually get picked up. Without this running, queueing a task does nothing — items sit in queue.json forever.",
    cli: "amaco queue run",
    examples: ["amaco queue run --exit-when-drained   # script-friendly"],
    action: {
      kind: "spawn-detached",
      argv: ["queue", "run"],
      toast: "Started `amaco queue run` — queued tasks will pick up within ~1s.",
    },
  },
  {
    id: "scheduler.pause",
    title: "Pause scheduler",
    hint: "stops launching new tasks; in-flight runs continue",
    keywords: ["queue", "halt"],
    description:
      "Sets `paused=true` on the scheduler state. New tasks won't launch; in-flight runs keep running. Resume to drain the queue again.",
    cli: "amaco queue pause",
    action: { kind: "pause-scheduler" },
  },
  {
    id: "scheduler.resume",
    title: "Resume scheduler",
    hint: "clears paused; queue starts draining again",
    keywords: ["queue", "start"],
    description: "Clears the scheduler's `paused` flag so queued tasks launch again.",
    cli: "amaco queue resume",
    action: { kind: "resume-scheduler" },
  },
  {
    id: "run.pause",
    title: "Pause selected run",
    hint: "graceful — stops at next stage boundary",
    keywords: ["stop", "halt"],
    description:
      "Requests a pause on the selected run. The orchestrator finishes the current agent and transitions to `paused`. Resume re-enters from the same boundary.",
    cli: "amaco pause <runId>",
    examples: ["amaco pause run-2026-…    # same effect as the panel"],
    action: { kind: "pause-run" },
  },
  {
    id: "run.resume",
    title: "Resume selected run",
    hint: "clears pauseRequested",
    description:
      "Clears the pause request on a paused run. The orchestrator picks it up on the next polling tick and transitions back to the previous stage.",
    cli: "amaco resume <runId>",
    action: { kind: "resume-run" },
  },
  {
    id: "run.abort",
    title: "Abort selected run",
    hint: "force-stops the run (y/N confirm)",
    keywords: ["stop", "kill"],
    description:
      "Marks the run as `aborted` and emits a `run.aborted` event. The worktree stays on disk so you can inspect or clean it up manually.",
    cli: "amaco abort <runId>",
    action: { kind: "abort-run" },
  },
  {
    id: "runner.open",
    title: "Run any amaco command…",
    hint: "shell-style command bar — `!` opens it directly",
    keywords: ["shell", "cli", "bang", "run"],
    description:
      "Opens a free-form command bar where you can type any `amaco …` invocation and see the output inside the panel. Argv-only, no shell expansion.",
    cli: "(this surface — use ! to open directly)",
    examples: [
      "status --json",
      "tasks list",
      "config show",
      "doctor --fix",
    ],
    action: { kind: "open-runner" },
  },
  {
    id: "runner.config-show",
    title: "Show config.json",
    hint: "amaco config show",
    keywords: ["config", "yaml", "json"],
    description:
      "Runs `amaco config show` and dumps the resolved project config into the runner output pane.",
    cli: "amaco config show",
    action: { kind: "open-runner", seed: "config show" },
  },
  {
    id: "runner.status-json",
    title: "Status as JSON",
    hint: "amaco status --json",
    keywords: ["runs", "status"],
    description:
      "Seeds the runner with `status --json` so you can capture / pipe / inspect the run list.",
    cli: "amaco status --json",
    action: { kind: "open-runner", seed: "status --json" },
  },
  {
    id: "ui.start",
    title: "Open dashboard in browser",
    hint: "amaco ui --open   (background)",
    keywords: ["ui", "browser", "web", "supervisor", "open", "launch"],
    description:
      "Spawns `amaco ui --open` in the background — boots the Fastify dashboard on http://127.0.0.1:4317 and tells `amaco ui` to open your default browser at that URL.",
    cli: "amaco ui --open",
    examples: [
      "amaco ui --open --port 4318    # custom port + auto-open",
      "amaco ui                       # start without opening the browser",
    ],
    action: {
      kind: "spawn-detached",
      argv: ["ui", "--open"],
      toast:
        "Started `amaco ui --open` — http://127.0.0.1:4317 (your browser should open).",
    },
  },
  {
    id: "ui.open-only",
    title: "Open dashboard URL only (server must already be up)",
    hint: "http://127.0.0.1:4317",
    keywords: ["ui", "browser", "web"],
    description:
      "Opens http://127.0.0.1:4317 in your default browser without spawning anything. Use this when the dashboard is already running and you just want a new tab.",
    cli: "(open http://127.0.0.1:4317 in any browser)",
    action: { kind: "open-url", url: "http://127.0.0.1:4317" },
  },
  {
    id: "run.start",
    title: "Run amaco for a free-form task",
    hint: "opens the runner pre-seeded with `run`",
    keywords: ["start", "task", "kick"],
    description:
      'Drops you into the runner with `run ""` so you can type the task in quotes. Use Roadmap [3] + Enter to launch a task from the kanban board.',
    cli: 'amaco run "describe the change"',
    action: { kind: "open-runner", seed: 'run ""' },
  },
  {
    id: "help.open",
    title: "Open help overlay",
    hint: "every keybinding, grouped",
    keywords: ["?", "keybindings"],
    description:
      "Full keymap with navigation, run actions, roadmap actions. Same as pressing `?`.",
    cli: "(panel only)",
    action: { kind: "open-help" },
  },
  {
    id: "shell.quit",
    title: "Quit amaco",
    hint: "exits the panel",
    keywords: ["exit"],
    description:
      "Closes the interactive panel. The on-disk state (runs, queue, tasks) is untouched and the CLI is fully available.",
    cli: "(or press q at any time)",
    action: { kind: "quit" },
  },
];

/**
 * Score a command against a query. Returns null when there's no match
 * at all so callers can drop it from the list. Higher scores rank
 * first; ties fall back to declaration order. The scoring is small on
 * purpose — a TUI palette doesn't need full fuzzy fanciness, just
 * "did the user's letters appear in order in the haystack".
 */
export function scoreCommand(
  cmd: PaletteCommand,
  query: string,
): number | null {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;
  const haystacks = [cmd.title, cmd.id, ...(cmd.keywords ?? [])]
    .map((s) => s.toLowerCase());
  let best: number | null = null;
  for (const h of haystacks) {
    const s = subsequenceScore(h, q);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

function subsequenceScore(haystack: string, needle: string): number | null {
  // Exact substring beats subsequence beats nothing. Score scales with
  // tightness so "rsm" matches "resume" tighter than "rsme" would.
  if (haystack.includes(needle)) return 100 - (haystack.length - needle.length);
  let hi = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  for (const ch of needle) {
    while (hi < haystack.length && haystack[hi] !== ch) hi += 1;
    if (hi >= haystack.length) return null;
    if (firstMatch < 0) firstMatch = hi;
    lastMatch = hi;
    hi += 1;
  }
  const span = lastMatch - firstMatch;
  return Math.max(0, 50 - span);
}

export function filterPalette(
  catalog: ReadonlyArray<PaletteCommand>,
  query: string,
  limit = 10,
): PaletteCommand[] {
  const scored: Array<{ cmd: PaletteCommand; score: number; ord: number }> = [];
  catalog.forEach((cmd, ord) => {
    const score = scoreCommand(cmd, query);
    if (score === null) return;
    scored.push({ cmd, score, ord });
  });
  scored.sort((a, b) => (b.score - a.score) || (a.ord - b.ord));
  return scored.slice(0, limit).map((s) => s.cmd);
}
