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
    case "control":
      return {
        title: "Run control",
        blurb:
          "One run: status, diff, activity and the controls.",
        commands: [],
        tips: [],
      };
    case "mission":
      return {
        title: "Mission Control",
        blurb:
          "Every active run, the queue depth, and what needs you.",
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
          "A new run: the brief, the flow, the crew.",
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
          "Every run, and the scheduler queue above them.",
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
          "The live state of one run.",
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
          "Your tasks, in status columns.",
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
          "One task, with its runs, comments and report.",
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
          "Runs, outcomes and spend across every project.",
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
          "Project, provider and notification settings.",
        commands: [
          { cmd: "vibe config show", note: "dump the resolved project config" },
          { cmd: "vibe provider list", note: "available providers + which CLI is detected" },
          { cmd: "vibe provider test <id>", note: "smoke-test that a provider works" },
          { cmd: "vibe doctor", note: "diagnose environment + config issues" },
          { cmd: "vibe notifications gateways", note: "configure notification gateways" },
        ],
      };
    case "policies":
      return {
        title: "Policies",
        blurb:
          "Your own rules, plus the security gates that cannot be turned off.",
        commands: [
          { cmd: "vibe policies list", note: "project policies + the hard security gates" },
          { cmd: 'vibe policies add <id> "<rule>" --fix "<fix>"', note: "an advise rule the reviewer checks" },
          { cmd: 'vibe policies add <id> "<rule>" --block --matcher "<regex>"', note: "a deterministic merge block" },
          { cmd: "vibe policies confirm|reject <id>", note: "act on a supervisor-proposed rule" },
          { cmd: "vibe policies migrate", note: "lift legacy persona preferences" },
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
          "Your repo, as Vibestrate sees it.",
        commands: cmds,
      };
    }
    case "source":
      // The unified Source page - hint by the active tab.
      if (route.tab === "tree") {
        return {
          title: "Git tree",
          blurb:
            "Pick two branches and see the merge before it happens. Undo is one click.",
          commands: [
            { cmd: "git merge --no-ff <source>", note: "what an applied merge runs on the target branch" },
            { cmd: "git reset --hard <pre-merge-sha>", note: "what an undo runs (only while unpushed + nothing built on top)" },
            { cmd: "vibe integrate preview", note: "the CLI's batch dry-run conflict report (per-run flow)" },
          ],
          tips: [
            "The interactive canvas has no CLI equivalent (a sanctioned UI-only exception); apply/undo are human-clicked, broker-gated, and never pushed.",
          ],
        };
      }
      if (route.tab === "merge") {
        return {
          title: "Merge window",
          blurb:
            "Advice on each merge-ready run, then the integrate action.",
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
      }
      return {
        title: "Git overview",
        blurb:
          "The worktree and diff for each run.",
        commands: [
          { cmd: "vibe bundles list", note: "validation bundles per run" },
          { cmd: "vibe bundles apply <bundleId>", note: "apply a bundle to the project root" },
          { cmd: "vibe bundles revert <bundleId>", note: "revert a previously applied bundle" },
          { cmd: "vibe validation run", note: "execute the validation profile" },
        ],
      };
    case "git":
      return {
        title: "Git overview",
        blurb:
          "The worktree and diff for each run.",
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
          "Pick two branches and see the merge before it happens. Undo is one click.",
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
          "Advice on each merge-ready run, then the integrate action.",
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
          "Where the project stands: shipped, open, and decided.",
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
    case "flow-editor":
      return {
        title: route.flowId ? "Edit a flow" : "New flow",
        blurb:
          "Steps, seats and the loop, checked against the flow schema as you go.",
        commands: [
          {
            cmd: 'vibe flows draft "describe the flow"',
            note: "the supervisor drafts one you then edit",
          },
          {
            cmd: "vibe flows import <file|url>",
            note: "write a flow from YAML you already have",
          },
          {
            cmd: route.flowId
              ? `vibe flows export ${route.flowId}`
              : "vibe flows export <flowId>",
            note: "the same flow as canonical YAML",
          },
        ],
      };
    case "flows":
      return {
        title: "Flows",
        blurb:
          "The flows Vibestrate found. Fork a builtin to change it.",
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
          "Totals across every run and every model.",
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
          "Your roles: the seats each fills, and the profile each runs on.",
        commands: [
          { cmd: "vibe config show", note: "crews + roles in project.yml" },
          {
            cmd: 'curl http://127.0.0.1:4317/api/crews',
            note: "raw JSON, scriptable",
          },
        ],
      };
    case "crew-editor":
      return {
        title: "Crew editor",
        blurb:
          "Compose a crew, or change a role's seats, profile, permissions and instructions.",
        commands: [
          {
            cmd: route.crewId ? `vibe crew show ${route.crewId}` : "vibe crew list",
            note: "the same roster in the terminal",
          },
          {
            cmd: 'vibe crew draft "who should be on this crew"',
            note: "let the supervisor propose a roster",
          },
          { cmd: "vibe crew presets add <id>", note: "install a ready-made crew" },
        ],
        tips: [
          "A role's own text lives in its JSON role file under .vibestrate/roles/; the crew wiring lives in project.yml.",
          "Adding, removing, or renaming a role is a project.yml edit - the editor hands you the exact block.",
        ],
      };
    case "profiles":
      return {
        title: "Profiles",
        blurb:
          "A profile is a provider, a model and a power level.",
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
          "The local CLIs Vibestrate drives. Detect, configure and test them.",
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
    case "dashboard":
      return {
        title: "Dashboard",
        blurb:
          "What is happening right now. Every panel can be moved or hidden.",
        commands: [
          { cmd: "vibe runs", note: "the same list on the CLI" },
          { cmd: "vibe status", note: "the current project's run state" },
        ],
        tips: [],
      };
    case "supervisors-new":
      return {
        title: "Add a supervisor",
        blurb:
          "A curated posture, or your own. Neither judges anything until you pick it.",
        commands: [
          { cmd: "vibe supervisor archetypes", note: "the curated catalog" },
          { cmd: "vibe supervisor adopt <id>", note: "adopt an archetype into this project" },
          { cmd: "vibe supervisor default <id>", note: "make it the project default" },
        ],
        tips: [
          "A custom supervisor is validated against the persona schema on save - a malformed field is refused, never coerced.",
        ],
      };
    case "supervisors":
      return {
        title: "Supervisors",
        blurb:
          "How hard each supervisor checks a run, and which is the default.",
        commands: [
          { cmd: "vibe supervisor list", note: "the persona catalog (built-ins + project)" },
          { cmd: "vibe supervisor list --json", note: "structured, scriptable" },
          { cmd: 'vibe run "task" --supervisor <id>', note: "run under a specific supervisor" },
        ],
        tips: [
          "Personas are authored in .vibestrate/project.yml (personas: + defaultPersona); a project persona can't smuggle free-form text into a reviewer - review lenses are a closed vocabulary.",
        ],
      };
    case "config":
      return {
        title: "Config",
        blurb:
          "project.yml, grouped and editable. The raw YAML is one command away.",
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
          "Ask about this project. It recommends, and never acts.",
        commands: [
          { cmd: 'vibe consult "should this use a heavier review?"', note: "ask a question" },
          { cmd: "vibe consult \"...\" --task <id>", note: "scope to a task's context" },
          { cmd: "vibe consult \"...\" --file src/x.ts", note: "include a file's content" },
          { cmd: "vibe consult \"...\" --json", note: "structured result" },
        ],
      };
  }
}
