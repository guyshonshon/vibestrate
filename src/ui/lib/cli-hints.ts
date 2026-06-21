// Pure mapping from the active dashboard Route to a "teach the CLI"
// hint card: a short title, one or more equivalent `vibe …` commands,
// and a one-line explanation. The point is to make the CLI surface
// discoverable from the UI - every dashboard action should be doable
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
  /** Extra tips for non-obvious flags (read-only, provider). */
  tips?: string[];
  /** Direct link into the CLI section of the README, if any. */
  docs?: string;
};

const TIPS_RUN: string[] = [
  "Add `--read-only` for an investigation-only run (refuses apply/validate/revert).",
  "Add `--crew <id>` to pick the crew, or `--profile <id>` to run every seated step on one profile.",
];

export function hintForRoute(route: Route): CliHint {
  switch (route.kind) {
    case "mission":
      return {
        title: "Mission Control",
        blurb:
          "Live view of every active run + queue depth + pending attention. The CLI has the same data behind several commands.",
        commands: [
          { cmd: "vibe status", note: "current runs (table)" },
          { cmd: "vibe shell", note: "interactive TUI version of this page" },
          { cmd: 'vibe run "describe the change"', note: "start a new run" },
        ],
        tips: TIPS_RUN,
      };
    case "compose":
      return {
        title: "New run",
        blurb:
          "Compose a run: brief, flow, crew, and the full control surface - or start one from your roadmap. The CLI maps 1:1.",
        commands: [
          { cmd: 'vibe run "describe the change"', note: "start a run" },
          { cmd: "vibe run --flow <id>", note: "pin a specific flow" },
          { cmd: "vibe run --task <id>", note: "run a roadmap card (grounds on it)" },
        ],
        tips: TIPS_RUN,
      };
    case "runs":
      return {
        title: "Runs & queue",
        blurb:
          "Browse, start, and inspect runs - plus the scheduler queue at the top. Everything you see here is also exposed on the CLI.",
        commands: [
          { cmd: "vibe shell", note: "live interactive panel (runs, agent, MCP, pause/resume)" },
          { cmd: "vibe status", note: "one-shot run table" },
          { cmd: 'vibe run "describe the change"', note: "start a new run" },
          { cmd: "vibe replay <runId>", note: "open the run timeline in the terminal" },
          { cmd: "vibe queue list", note: "what's enqueued, in order" },
          { cmd: "vibe queue run", note: "drain the queue (one task at a time)" },
        ],
        tips: TIPS_RUN,
      };
    case "run":
      return {
        title: "Run detail",
        blurb:
          "Live state of a single run. The CLI surfaces the same projection plus pause/resume.",
        commands: [
          { cmd: `vibe status ${route.runId}`, note: "current phase + summary" },
          { cmd: `vibe replay ${route.runId}`, note: "scroll the timeline event-by-event" },
          { cmd: `vibe pause ${route.runId}`, note: "request a pause at the next safe boundary" },
          { cmd: `vibe resume ${route.runId}`, note: "resume from the paused boundary" },
          { cmd: `vibe abort ${route.runId}`, note: "stop the run immediately" },
        ],
        tips: [
          "The inspector tab in the URL (`?tab=replay`, `?tab=diff`, …) deep-links into a panel.",
        ],
      };
    case "board":
      return {
        title: "Roadmap board",
        blurb:
          "Tasks across status columns. The same backlog drives `vibe tasks` and `vibe queue`.",
        commands: [
          { cmd: "vibe tasks list", note: "table of tasks with status + linked runs" },
          { cmd: 'vibe tasks add "title"', note: "create a new task" },
          { cmd: "vibe roadmap show", note: "raw roadmap document" },
        ],
        tips: [
          "Append `--read-only` on `vibe tasks add` to mark the task as investigation-only.",
        ],
      };
    case "task":
      return {
        title: "Task detail",
        blurb:
          "One task with its runs, comments, and report. The CLI mirrors every view here.",
        commands: [
          { cmd: `vibe tasks show ${route.taskId}`, note: "full task record" },
          { cmd: `vibe tasks report ${route.taskId}`, note: "rendered implementation report" },
          { cmd: `vibe tasks comments ${route.taskId}`, note: "thread of comments" },
          { cmd: `vibe tasks queue ${route.taskId}`, note: "enqueue this task for the runner" },
          { cmd: `vibe run --task ${route.taskId} "describe the slice"`, note: "run linked to this task" },
        ],
        tips: TIPS_RUN,
      };
    case "workspace":
      return {
        title: "All projects",
        blurb:
          "Cross-project rollup - runs, outcomes, and spend across every registered project. The CLI exposes the same data.",
        commands: [
          { cmd: "vibe workspace overview", note: "rollup across registered projects" },
          { cmd: "vibe workspace list", note: "registered projects (live ● / dormant ○)" },
          { cmd: "vibe workspace open <label>", note: "open a project, starting it if dormant" },
          { cmd: "vibe workspace close <label>", note: "shut down its dashboard + scheduler (refuses if busy)" },
        ],
        tips: [
          "Each project is its own isolated dashboard + scheduler; opening one starts its own `vibe ui` and lands you in a fresh tab. `close` stops it (add --force to override a busy project).",
        ],
      };
    case "proposals":
      return {
        title: "Proposals",
        blurb:
          "Agent-generated change proposals waiting for human approval.",
        commands: [
          { cmd: "vibe approvals list", note: "all pending approvals" },
          { cmd: "vibe suggestions list", note: "all suggestions waiting for review" },
        ],
      };
    case "proposal":
      return {
        title: "Proposal detail",
        blurb: "Inspect or accept a single proposal from the CLI.",
        commands: [
          { cmd: `vibe approvals show ${route.proposalId}`, note: "inspect the diff + metadata" },
          { cmd: `vibe approvals accept ${route.proposalId}`, note: "accept the proposed change" },
          { cmd: `vibe approvals reject ${route.proposalId}`, note: "reject with a reason" },
        ],
      };
    case "settings":
      return {
        title: "Settings",
        blurb:
          "Project + provider + notification settings. The CLI exposes the same knobs without a server.",
        commands: [
          { cmd: "vibe config show", note: "dump the resolved project config" },
          { cmd: "vibe provider list", note: "available providers + which CLI is detected" },
          { cmd: "vibe provider test <id>", note: "smoke-test that a provider works" },
          { cmd: "vibe doctor", note: "diagnose environment + config issues" },
          { cmd: "vibe notifications gateways", note: "configure notification gateways" },
        ],
      };
    case "project":
      return {
        title: "Project overview",
        blurb: "High-level project state. CLI equivalents below.",
        commands: [
          { cmd: "vibe status", note: "recent runs at a glance" },
          { cmd: "vibe roadmap show", note: "current roadmap document" },
          { cmd: "vibe doctor", note: "environment + config check" },
        ],
      };
    case "codebase": {
      const cmds: CliCommand[] = [
        { cmd: "vibe skills list", note: "skills the orchestrator can pull in" },
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
          "Read-only navigation of the repo as Vibestrate sees it. The CLI doesn't replicate the tree, but exposes the metadata.",
        commands: cmds,
      };
    }
    case "git":
      return {
        title: "Git overview",
        blurb:
          "Per-run worktree + diff state. Bundles and validation live on the CLI.",
        commands: [
          { cmd: "vibe bundles list", note: "validation bundles per run" },
          { cmd: "vibe bundles apply <bundleId>", note: "apply a bundle to the project root" },
          { cmd: "vibe bundles revert <bundleId>", note: "revert a previously applied bundle" },
          { cmd: "vibe validation run", note: "execute the validation profile" },
        ],
      };
    case "git-tree":
      return {
        title: "Git tree",
        blurb:
          "Interactive any-node-to-any-node merge: pick source + target, see the predicted result and conflicts before anything is applied, and undo with one click. UI-only by design - the underlying ops are plain git.",
        commands: [
          { cmd: "git merge --no-ff <source>", note: "what an applied merge runs on the target branch" },
          { cmd: "git reset --hard <pre-merge-sha>", note: "what an undo runs (only while unpushed + nothing built on top)" },
          { cmd: "vibe integrate preview", note: "the CLI's batch dry-run conflict report (per-run flow)" },
        ],
        tips: [
          "The interactive canvas has no CLI equivalent (a sanctioned UI-only exception); apply/undo are human-clicked, broker-gated, and never pushed.",
        ],
      };
    case "merge":
      return {
        title: "Merge window",
        blurb:
          "Read-only merge advice per merge-ready run, then the explicit integrate/finish actions. Full parity on the CLI.",
        commands: [
          { cmd: "vibe integrate advise", note: "deterministic advice for all merge-ready runs" },
          { cmd: `vibe integrate advise ${route.runId ?? "<runId>"} --json`, note: "one run, machine-readable" },
          { cmd: `vibe integrate analyze ${route.runId ?? "<runId>"}`, note: "optional LLM read of the diff (advisory, not a verdict)" },
          { cmd: "vibe integrate preview", note: "dry-run merge conflict report" },
          { cmd: "vibe integrate apply --into integration/<name>", note: "integrate into a dedicated branch (never main)" },
          { cmd: "vibe integrate finish <branch>", note: "merge to main - typed confirmation, local only" },
        ],
        tips: [
          "Advice is computed from git facts + check lanes - no model output; it never merges anything.",
        ],
      };
    case "ledger":
      return {
        title: "Project ledger",
        blurb:
          "Where the project stands - shipped, open intents, follow-ups, decisions. Same view as the CLI.",
        commands: [
          { cmd: "vibe ledger", note: "the continuity brief in your terminal" },
          { cmd: "vibe ledger --json", note: "the folded ledger state as JSON" },
        ],
        tips: [
          "The ledger is machine-written when a run reaches merge-ready, and editable by hand under .vibestrate/.",
        ],
      };
    case "flow":
      return {
        title: "Flow Builder",
        blurb:
          "Design how agents work together. Project flows live in .vibestrate/flows/.",
        commands: [
          { cmd: "vibe flows list", note: "discovered flows" },
          {
            cmd: "vibe flows show <flowId>",
            note: "resolved snapshot for a flow",
          },
          {
            cmd: 'vibe run "task" --flow <flowId>',
            note: "run using a specific flow",
          },
        ],
      };
    case "flows":
      return {
        title: "Flows",
        blurb:
          "Browse the flow recipes Vibestrate discovers. Fork a builtin into .vibestrate/flows/ to customize it, then run it.",
        commands: [
          { cmd: "vibe flows list", note: "discovered flows (builtin + project)" },
          { cmd: "vibe flows show <flowId>", note: "inspect a flow's flow" },
          { cmd: 'vibe run "task" --flow <flowId>', note: "run using a flow" },
        ],
      };
    case "metrics":
      return {
        title: "Metrics",
        blurb:
          "Rollups across every run and every model. Same data as the JSON metrics endpoint.",
        commands: [
          {
            cmd: "vibe status",
            note: "live counts (text version of the KPI strip)",
          },
          {
            cmd: 'curl http://127.0.0.1:4317/api/metrics/overview?range=7d',
            note: "raw JSON, scriptable",
          },
        ],
      };
    case "crew":
      return {
        title: "Crew",
        blurb:
          "Your local team of roles - the seats each fills and the profile each runs on. Edit roles in `.vibestrate/project.yml` or here.",
        commands: [
          { cmd: "vibe config show", note: "crews + roles in project.yml" },
          {
            cmd: 'curl http://127.0.0.1:4317/api/crews',
            note: "raw JSON, scriptable",
          },
        ],
      };
    case "profiles":
      return {
        title: "Profiles",
        blurb:
          "Runtime profiles - provider + model + power. Roles point at a profile; override per run with `--profile` or per step with `--step-profile`.",
        commands: [
          { cmd: "vibe config show", note: "profiles in project.yml" },
          {
            cmd: 'curl http://127.0.0.1:4317/api/profiles',
            note: "raw JSON, scriptable",
          },
        ],
      };
    case "providers":
      return {
        title: "Providers",
        blurb:
          "Detect, configure, set, and test the local CLIs Vibestrate drives - the same actions as the `vibe provider` commands.",
        commands: [
          { cmd: "vibe provider detect", note: "what's installed + confidence" },
          { cmd: "vibe provider setup", note: "apply a preset / wire flags" },
          { cmd: "vibe provider set <id>", note: "make it the default for every agent" },
          { cmd: "vibe provider test <id>", note: "safe smoke test; tells you to log in if needed" },
        ],
        tips: [
          "If a test says a provider isn't logged in, run its login command in your own terminal (e.g. `codex login`, `gemini`, `goose configure`).",
        ],
      };
    case "config":
      return {
        title: "Config",
        blurb:
          "A readable, grouped view of project.yml - what each section controls and where it's editable. The raw YAML is one command away.",
        commands: [
          { cmd: "vibe config view", note: "grouped, readable view (this page)" },
          { cmd: "vibe config view --json", note: "the structured view, scriptable" },
          { cmd: "vibe config show", note: "raw project.yml dump" },
          { cmd: "vibe config set <path> <value>", note: "edit one value (e.g. git.mainBranch)" },
        ],
      };
    case "consult":
      return {
        title: "Consult",
        blurb:
          "Ask the project orchestrator a question, answered from controlled project context (VIBESTRATE.md + config + recent runs + annotations). Read-only - it recommends, never acts.",
        commands: [
          { cmd: 'vibe consult "should this use a heavier review?"', note: "ask a question" },
          { cmd: "vibe consult \"...\" --task <id>", note: "scope to a task's context" },
          { cmd: "vibe consult \"...\" --file src/x.ts", note: "include a file's content" },
          { cmd: "vibe consult \"...\" --json", note: "structured result" },
        ],
      };
  }
}
