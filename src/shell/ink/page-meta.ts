// Per-page human-friendly meta — subtitle (one line under the title),
// blurb (paragraph for the ? overlay), and a small set of common
// keys / CLI commands the user can lean on while learning the panel.
// Kept here so every page can pull from the same source of truth and
// the help overlay can echo it back.

import type { PageId } from "./ui-state.js";

export type PageMeta = {
  /** One short line shown directly under the page title. */
  subtitle: string;
  /** Longer paragraph shown in the ? overlay's "Current page" block. */
  blurb: string;
  /** Sample keys (page-specific) shown in the ? overlay. */
  commonKeys?: Array<[string, string]>;
  /** Sample CLI commands the user can run for this surface. */
  commonCli?: string[];
};

export const PAGE_META: Record<PageId, PageMeta> = {
  dashboard: {
    subtitle: "live overview · active runs, queue, attention inbox",
    blurb:
      "Mission control. Active runs, queue depth, pending approvals + suggestions, recent activity across every run. Use this as your starting point.",
    commonKeys: [
      ["2", "switch to Roadmap to define a task"],
      ["4", "switch to Runs to inspect an execution"],
    ],
    commonCli: ["vibestrate status", "vibestrate shell"],
  },
  roadmap: {
    subtitle:
      "tasks you've defined · this is where work begins (kanban backlog)",
    blurb:
      "A task is a durable unit of work that lives on this board. Create one with n; queue or run it with Q / ↵. One task can produce many runs over time — see them under [4] Runs.",
    commonKeys: [
      ["n", "new task"],
      ["e / d", "edit / delete selected task"],
      ["↵ or r", "run the selected task"],
      ["Q", "enqueue (scheduler picks it up next)"],
      ["c", "promote a backlog task to ready"],
    ],
    commonCli: [
      "vibestrate tasks list",
      'vibestrate tasks add "title" --priority high --effort medium',
      "vibestrate tasks show <taskId>",
    ],
  },
  queue: {
    subtitle:
      "tasks scheduled to run next · the scheduler picks them up here",
    blurb:
      "FIFO + priority + fair queue. Each entry has a `source` so per-source quotas can prevent one origin (cron, agent, you) from monopolizing the workers. Start the loop with `vibestrate queue run`.",
    commonKeys: [
      ["↑↓", "select queued entry"],
      ["p", "pause / resume the scheduler"],
      ["x", "remove the selected entry from the queue"],
    ],
    commonCli: [
      "vibestrate queue list",
      "vibestrate queue add <taskId> --source <name>",
      "vibestrate queue run",
    ],
  },
  runs: {
    subtitle:
      "executions of tasks · one task can have many runs · inspect + retry here",
    blurb:
      "A run is one execution of a task. Active runs show the current agent + MCP + skills; finished runs show why they ended + which agent ran last. Press R on a finished run to retry.",
    commonKeys: [
      ["↑↓", "select run"],
      ["tab / o e v", "switch inspector section"],
      ["/", "filter the events tail"],
      ["p / r / a", "pause / resume / abort"],
      ["R", "re-run as a fresh vibestrate run"],
    ],
    commonCli: [
      "vibestrate status",
      "vibestrate status <runId>",
      "vibestrate replay <runId>",
      "vibestrate pause <runId>",
    ],
  },
  approvals: {
    subtitle:
      "gates the orchestrator paused at · approve / reject to unblock",
    blurb:
      "Some agents emit `HUMAN_APPROVAL: REQUIRED` before sensitive steps, and policies can force approvals at specific stages. Approvals in this inbox are the runs blocked on you right now.",
    commonKeys: [
      ["↑↓", "select"],
      ["a", "approve"],
      ["r", "reject"],
    ],
    commonCli: [
      "vibestrate approvals list",
      "vibestrate approvals accept <id>",
      'vibestrate approvals reject <id> --reason "needs migration"',
    ],
  },
  suggestions: {
    subtitle:
      "patches an agent proposed for review · accept to apply, reject to drop",
    blurb:
      "When the reviewer / executor wants you to look at a specific change before it lands, it files a suggestion. Apply via the CLI or via the panel; bundles let you apply many in one step.",
    commonKeys: [
      ["↑↓", "select"],
      ["a", "approve"],
      ["r", "reject"],
    ],
    commonCli: [
      "vibestrate suggestions list",
      "vibestrate suggestions show <id>",
      "vibestrate bundles apply <bundleId>",
      "vibestrate bundles revert <bundleId>",
    ],
  },
  notifications: {
    subtitle: "alerts routed through your configured gateways",
    blurb:
      "Every notable orchestrator event can route to CLI / in-app / webhook / Discord / Slack / Telegram gateways. Use `vibestrate gateways add` to wire one up.",
    commonKeys: [["↑↓", "select notification"]],
    commonCli: ["vibestrate notifications list", "vibestrate gateways"],
  },
  agents: {
    subtitle:
      "the planner / architect / executor / etc. that do the work",
    blurb:
      "Configured agents from .vibestrate/project.yml. Each agent has a provider (claude-code / codex / ollama / aider), a prompt file, a permissions profile, attached skills, and optional MCP servers. Edit via project.yml.",
    commonKeys: [["↑↓", "select agent"]],
    commonCli: ["vibestrate config show", "vibestrate provider list"],
  },
  skills: {
    subtitle:
      "knowledge bundles you can attach to agents (incl. MCP servers)",
    blurb:
      "Skills live under .vibestrate/skills/ and .claude/skills/. Each can carry a sibling .mcp.json that declares MCP servers — attaching the skill to an agent attaches the servers too.",
    commonKeys: [
      ["↑↓", "select skill"],
      ["←→", "focus agent"],
      ["↵ or space", "toggle assignment for the focused skill-agent pair"],
    ],
    commonCli: [
      "vibestrate skills list",
      "vibestrate skills show <id>",
      "vibestrate skills assign <id> <agent>",
    ],
  },
  doctor: {
    subtitle: "environment + config diagnostics · with safe auto-fixes",
    blurb:
      "Runs the same checks as `vibestrate doctor` against your machine: git available, project.yml present + valid, prompts reachable, providers detected. Press f to apply safe scaffold fixes.",
    commonKeys: [
      ["r", "rerun diagnostics"],
      ["f", "apply safe fixes (creates missing dirs/templates)"],
    ],
    commonCli: ["vibestrate doctor", "vibestrate doctor --fix", "vibestrate doctor --json"],
  },
};
