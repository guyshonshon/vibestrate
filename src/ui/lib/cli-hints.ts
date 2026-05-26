// Pure mapping from the active dashboard Route to a "teach the CLI"
// hint card: a short title, one or more equivalent `amaco …` commands,
// and a one-line explanation. The point is to make the CLI surface
// discoverable from the UI — every dashboard action should be doable
// from the terminal, and this surface tells the user how.
//
// Kept import-free (no React, no browser APIs) so it can be exercised
// from the node-only Vitest environment.

import type { Route } from "../app/route.js";

export type CliCommand = {
  cmd: string;
  note?: string;
};

export type CliHint = {
  title: string;
  blurb: string;
  commands: CliCommand[];
  /** Extra tips for non-obvious flags (effort, read-only, provider). */
  tips?: string[];
  /** Direct link into the CLI section of the README, if any. */
  docs?: string;
};

const TIPS_RUN: string[] = [
  "Add `--effort low|medium|high` to bucket the work; the heuristic picks one when omitted.",
  "Add `--read-only` for an investigation-only run (refuses apply/validate/revert).",
  "Add `--provider <id>` to override the agent provider just for this run.",
];

export function hintForRoute(route: Route): CliHint {
  switch (route.kind) {
    case "mission":
      return {
        title: "Mission Control",
        blurb:
          "Live view of every active run + queue depth + pending attention. The CLI has the same data behind several commands.",
        commands: [
          { cmd: "amaco status", note: "current runs (table)" },
          { cmd: "amaco shell", note: "interactive TUI version of this page" },
          { cmd: 'amaco run "describe the change"', note: "start a new run" },
        ],
        tips: TIPS_RUN,
      };
    case "runs":
      return {
        title: "Runs list",
        blurb:
          "Browse, start, and inspect runs. Everything you see here is also exposed on the CLI.",
        commands: [
          { cmd: "amaco shell", note: "live interactive panel (runs, agent, effort, MCP, pause/resume)" },
          { cmd: "amaco status", note: "one-shot run table" },
          { cmd: 'amaco run "describe the change"', note: "start a new run" },
          { cmd: "amaco replay <runId>", note: "open the run timeline in the terminal" },
        ],
        tips: TIPS_RUN,
      };
    case "run":
      return {
        title: "Run detail",
        blurb:
          "Live state of a single run. The CLI surfaces the same projection plus pause/resume.",
        commands: [
          { cmd: `amaco status ${route.runId}`, note: "current phase + summary" },
          { cmd: `amaco replay ${route.runId}`, note: "scroll the timeline event-by-event" },
          { cmd: `amaco pause ${route.runId}`, note: "request a pause at the next safe boundary" },
          { cmd: `amaco resume ${route.runId}`, note: "resume from the paused boundary" },
          { cmd: `amaco abort ${route.runId}`, note: "stop the run immediately" },
        ],
        tips: [
          "The inspector tab in the URL (`?tab=replay`, `?tab=diff`, …) deep-links into a panel.",
        ],
      };
    case "board":
      return {
        title: "Roadmap board",
        blurb:
          "Tasks across status columns. The same backlog drives `amaco tasks` and `amaco queue`.",
        commands: [
          { cmd: "amaco tasks list", note: "table of tasks with status + linked runs" },
          {
            cmd: 'amaco tasks add "title" --effort medium',
            note: "create a new task with an effort bucket",
          },
          { cmd: "amaco roadmap show", note: "raw roadmap document" },
        ],
        tips: [
          "Append `--read-only` on `amaco tasks add` to mark the task as investigation-only.",
        ],
      };
    case "task":
      return {
        title: "Task detail",
        blurb:
          "One task with its runs, comments, and report. The CLI mirrors every view here.",
        commands: [
          { cmd: `amaco tasks show ${route.taskId}`, note: "full task record" },
          { cmd: `amaco tasks report ${route.taskId}`, note: "rendered implementation report" },
          { cmd: `amaco tasks comments ${route.taskId}`, note: "thread of comments" },
          { cmd: `amaco tasks queue ${route.taskId}`, note: "enqueue this task for the runner" },
          { cmd: `amaco run --task ${route.taskId} "describe the slice"`, note: "run linked to this task" },
        ],
        tips: TIPS_RUN,
      };
    case "queue":
      return {
        title: "Queue",
        blurb:
          "FIFO + priority + dependency queue. `amaco queue` is the canonical surface.",
        commands: [
          { cmd: "amaco queue list", note: "what's enqueued, in order" },
          { cmd: "amaco queue status", note: "runner state + active item" },
          { cmd: "amaco queue add <taskId> --source <name>", note: "enqueue with an origin label for fairness/quotas" },
          { cmd: "amaco queue run", note: "drain the queue (one task at a time)" },
          { cmd: "amaco queue conflicts", note: "show predicted worktree conflicts" },
        ],
        tips: [
          "Set `scheduler.queuePolicy: fair` + `sourceQuotas: { cron: 1, user: 3 }` in project.yml to stop one origin from starving others.",
        ],
      };
    case "proposals":
      return {
        title: "Proposals",
        blurb:
          "Agent-generated change proposals waiting for human approval.",
        commands: [
          { cmd: "amaco approvals list", note: "all pending approvals" },
          { cmd: "amaco suggestions list", note: "all suggestions waiting for review" },
        ],
      };
    case "proposal":
      return {
        title: "Proposal detail",
        blurb: "Inspect or accept a single proposal from the CLI.",
        commands: [
          { cmd: `amaco approvals show ${route.proposalId}`, note: "inspect the diff + metadata" },
          { cmd: `amaco approvals accept ${route.proposalId}`, note: "accept the proposed change" },
          { cmd: `amaco approvals reject ${route.proposalId}`, note: "reject with a reason" },
        ],
      };
    case "settings":
      return {
        title: "Settings",
        blurb:
          "Project + provider + notification settings. The CLI exposes the same knobs without a server.",
        commands: [
          { cmd: "amaco config show", note: "dump the resolved project config" },
          { cmd: "amaco provider list", note: "available providers + which CLI is detected" },
          { cmd: "amaco provider test <id>", note: "smoke-test that a provider works" },
          { cmd: "amaco doctor", note: "diagnose environment + config issues" },
          { cmd: "amaco notifications gateways", note: "configure notification gateways" },
        ],
      };
    case "project":
      return {
        title: "Project overview",
        blurb: "High-level project state. CLI equivalents below.",
        commands: [
          { cmd: "amaco status", note: "recent runs at a glance" },
          { cmd: "amaco roadmap show", note: "current roadmap document" },
          { cmd: "amaco doctor", note: "environment + config check" },
        ],
      };
    case "codebase": {
      const cmds: CliCommand[] = [
        { cmd: "amaco skills list", note: "skills the orchestrator can pull in" },
      ];
      if (route.filePath) {
        cmds.unshift({
          cmd: `$EDITOR ${route.filePath}${route.line ? `:${route.line}` : ""}`,
          note: "open the same file in your editor",
        });
      }
      return {
        title: "Codebase browser",
        blurb:
          "Read-only navigation of the repo as Amaco sees it. The CLI doesn't replicate the tree, but exposes the metadata.",
        commands: cmds,
      };
    }
    case "git":
      return {
        title: "Git overview",
        blurb:
          "Per-run worktree + diff state. Bundles and validation live on the CLI.",
        commands: [
          { cmd: "amaco bundles list", note: "validation bundles per run" },
          { cmd: "amaco bundles apply <bundleId>", note: "apply a bundle to the project root" },
          { cmd: "amaco bundles revert <bundleId>", note: "revert a previously applied bundle" },
          { cmd: "amaco validation run", note: "execute the validation profile" },
        ],
      };
    case "flow":
      return {
        title: "Flow Builder",
        blurb:
          "Design how agents work together. Project guides live in .amaco/guides/.",
        commands: [
          { cmd: "amaco guides list", note: "discovered guides" },
          {
            cmd: "amaco guides show <guideId>",
            note: "resolved snapshot for a guide",
          },
          {
            cmd: 'amaco run "task" --guide <guideId>',
            note: "run using a specific guide",
          },
        ],
      };
    case "guides":
      return {
        title: "Guides",
        blurb:
          "Browse the guide recipes Amaco discovers. Fork a builtin into .amaco/guides/ to customize it, then run it.",
        commands: [
          { cmd: "amaco guides list", note: "discovered guides (builtin + project)" },
          { cmd: "amaco guides show <guideId>", note: "inspect a guide's flow" },
          { cmd: 'amaco run "task" --guide <guideId>', note: "run using a guide" },
        ],
      };
    case "metrics":
      return {
        title: "Metrics",
        blurb:
          "Rollups across every run and every model. Same data as the JSON metrics endpoint.",
        commands: [
          {
            cmd: "amaco status",
            note: "live counts (text version of the KPI strip)",
          },
          {
            cmd: 'curl http://127.0.0.1:4317/api/metrics/overview?range=7d',
            note: "raw JSON, scriptable",
          },
        ],
      };
    case "agents":
      return {
        title: "Agents",
        blurb:
          "Roster + capability detail. Edit providers in `.amaco/project.yml`.",
        commands: [
          {
            cmd: "amaco doctor",
            note: "verify every provider's CLI is on PATH",
          },
          {
            cmd: 'curl http://127.0.0.1:4317/api/agents/overview',
            note: "raw JSON, scriptable",
          },
        ],
      };
    case "providers":
      return {
        title: "Providers",
        blurb:
          "Detect, configure, set, and test the local CLIs Amaco drives — the same actions as the `amaco provider` commands.",
        commands: [
          { cmd: "amaco provider detect", note: "what's installed + confidence" },
          { cmd: "amaco provider setup", note: "apply a preset / wire flags" },
          { cmd: "amaco provider set <id>", note: "make it the default for every agent" },
          { cmd: "amaco provider test <id>", note: "safe smoke test; tells you to log in if needed" },
        ],
        tips: [
          "If a test says a provider isn't logged in, run its login command in your own terminal (e.g. `codex login`, `gemini`, `goose configure`).",
        ],
      };
  }
}
