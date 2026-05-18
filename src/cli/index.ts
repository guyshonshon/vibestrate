#!/usr/bin/env node
import { Command } from "commander";
import { runInitCommand } from "./commands/init.js";
import { runRunCommand } from "./commands/run.js";
import { runStatusCommand } from "./commands/status.js";
import { runAbortCommand } from "./commands/abort.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runSetupCommand } from "./commands/setup.js";
import { runUiCommand } from "./commands/ui.js";
import { buildProviderCommand } from "./commands/provider/index.js";
import { buildConfigCommand } from "./commands/config/index.js";
import { buildSkillsCommand } from "./commands/skills/index.js";
import { buildApprovalsCommand } from "./commands/approvals/index.js";
import { buildRoadmapCommand } from "./commands/roadmap.js";
import { buildTasksCommand } from "./commands/tasks.js";
import { buildQueueCommand } from "./commands/queue.js";
import { buildLogsCommand } from "./commands/logs.js";
import {
  buildGatewaysCommand,
  buildNotificationsCommand,
} from "./commands/notifications.js";
import { buildEditorCommand } from "./commands/editor.js";
import { buildSuggestionsCommand } from "./commands/suggestions.js";
import { buildBundlesCommand } from "./commands/bundles.js";
import { buildValidationCommand } from "./commands/validation.js";
import { buildTerminalCommand } from "./commands/terminal.js";
import { buildPoliciesCommand } from "./commands/policies.js";
import { buildReplayCommand } from "./commands/replay.js";
import { buildPauseCommand, buildResumeCommand } from "./commands/pause.js";
import { buildShellCommand } from "./commands/shell.js";

const program = new Command();

program
  .name("amaco")
  .description(
    "Amaco — local-first autonomous multi-agent completion orchestrator. Runs your local agent CLIs through plan → architect → implement → validate → review → fix → verify in isolated git worktrees.",
  )
  .version("0.0.1");

program
  .command("init")
  .description("Initialize Amaco in the current project (.amaco/ scaffold).")
  .option("--force", "overwrite existing config files (runs are preserved)")
  .option("--yes", "non-interactive: use safe detected defaults, never wait for input")
  .option("--interactive", "force the guided wizard even when --yes would default to non-interactive")
  .action(async (opts: { force?: boolean; yes?: boolean; interactive?: boolean }) => {
    const code = await runInitCommand({
      force: opts.force,
      yes: opts.yes,
      interactive: opts.interactive,
    });
    process.exit(code);
  });

program
  .command("setup")
  .description("Guided wizard for provider, validation commands, and run defaults.")
  .action(async () => {
    const code = await runSetupCommand();
    process.exit(code);
  });

program.addCommand(buildProviderCommand());
program.addCommand(buildConfigCommand());
program.addCommand(buildSkillsCommand());
program.addCommand(buildApprovalsCommand());
program.addCommand(buildRoadmapCommand());
program.addCommand(buildTasksCommand());
program.addCommand(buildQueueCommand());
program.addCommand(buildLogsCommand());
program.addCommand(buildNotificationsCommand());
program.addCommand(buildGatewaysCommand());
program.addCommand(buildEditorCommand());
program.addCommand(buildSuggestionsCommand());
program.addCommand(buildBundlesCommand());
program.addCommand(buildValidationCommand());
program.addCommand(buildTerminalCommand());
program.addCommand(buildPoliciesCommand());
program.addCommand(buildReplayCommand());
program.addCommand(buildPauseCommand());
program.addCommand(buildResumeCommand());
program.addCommand(buildShellCommand());

program
  .command("run <task...>")
  .description("Run the default plan→architect→implement→review→verify workflow.")
  .option("--ui", "start the local supervisor dashboard alongside the run")
  .option("--ui-port <port>", "port for the supervisor dashboard (default 4317)", (v) => parseInt(v, 10))
  .option(
    "--task <taskId>",
    "link this run to a roadmap task; updates task status and runIds.",
  )
  .option(
    "--effort <level>",
    "effort bucket (low|medium|high). Maps to a provider via project.yml#effortMap.",
  )
  .option(
    "--provider <id>",
    "override the provider for every agent in this run (wins over --effort).",
  )
  .option(
    "--read-only",
    "investigation-only run: skip executor + fix loop; refuse apply/validate/revert; force readOnly permissions on every agent.",
  )
  .option(
    "--auto-effort",
    "apply the heuristic effort suggestion when --effort isn't passed.",
  )
  .option(
    "--skills <list>",
    "comma-separated skill ids to attach to every agent for this single run (merged with each agent's configured skills).",
  )
  .option(
    "--concise",
    "ask agents to produce token-efficient output (prefer diffs, bullets, no preamble).",
  )
  .action(
    async (
      taskParts: string[],
      opts: {
        ui?: boolean;
        uiPort?: number;
        task?: string;
        effort?: string;
        provider?: string;
        readOnly?: boolean;
        autoEffort?: boolean;
        skills?: string;
        concise?: boolean;
      },
    ) => {
      const task = taskParts.join(" ").trim();
      let effort: "low" | "medium" | "high" | null = null;
      if (opts.effort) {
        if (opts.effort !== "low" && opts.effort !== "medium" && opts.effort !== "high") {
          console.error(`--effort must be one of low|medium|high (got "${opts.effort}").`);
          process.exit(2);
        }
        effort = opts.effort;
      }
      const runtimeSkills = (opts.skills ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const code = await runRunCommand(task, {
        ui: opts.ui,
        uiPort: opts.uiPort,
        taskId: opts.task ?? null,
        effort,
        providerOverride: opts.provider ?? null,
        readOnly: opts.readOnly ?? false,
        autoEffort: opts.autoEffort ?? false,
        runtimeSkills,
        concise: opts.concise ?? false,
      });
      process.exit(code);
    },
  );

program
  .command("ui")
  .description("Start the local supervisor dashboard for this project.")
  .option("--port <port>", "port to bind (default 4317)", (v) => parseInt(v, 10))
  .option(
    "--no-open",
    "don't open the dashboard in your default browser on startup (default: open).",
  )
  .option(
    "--no-scheduler",
    "don't start the managed scheduler subprocess (default: on; the UI owns its lifecycle).",
  )
  .action(
    async (opts: { port?: number; open?: boolean; scheduler?: boolean }) => {
      const code = await runUiCommand({
        port: opts.port,
        // commander's `--no-foo` form sets `opts.foo` to `false`; the
        // absence of the flag leaves it `undefined`. Default to true.
        open: opts.open !== false,
        scheduler: opts.scheduler,
      });
      process.exit(code);
    },
  );

program
  .command("status")
  .description("List Amaco runs in this project.")
  .option("--json", "emit JSON instead of a human-readable table")
  .action(async (opts: { json?: boolean }) => {
    const code = await runStatusCommand({ json: opts.json });
    process.exit(code);
  });

program
  .command("abort <runId>")
  .description("Mark a run as aborted (does not delete the worktree).")
  .action(async (runId: string) => {
    const code = await runAbortCommand(runId);
    process.exit(code);
  });

program
  .command("doctor")
  .description("Check environment, config, providers, and recommend next steps.")
  .option("--json", "emit JSON")
  .option("--fix", "apply safe fixes (create missing dirs/templates, add Claude provider if detected, suggest validation)")
  .action(async (opts: { json?: boolean; fix?: boolean }) => {
    const code = await runDoctorCommand({ json: opts.json, fix: opts.fix });
    process.exit(code);
  });

program.showHelpAfterError();

// `amaco` with no subcommand opens the interactive shell. Use `amaco
// --help` (or any other subcommand) to opt out. We only treat *zero*
// extra args as the shell trigger so `amaco --version` etc still work.
const extraArgv = process.argv.slice(2);
if (extraArgv.length === 0) {
  void (async () => {
    try {
      const { detectProject } = await import("../project/project-detector.js");
      const { runInkShell } = await import("../shell/ink/runtime.js");
      const detected = await detectProject(process.cwd());
      const code = await runInkShell({ projectRoot: detected.projectRoot });
      process.exit(code);
    } catch (err) {
      const { formatError } = await import("../core/error-format.js");
      const f = formatError(err);
      process.stderr.write(`amaco: ${f.title}\n`);
      if (f.detail && f.detail !== f.title)
        process.stderr.write(`  detail: ${f.detail}\n`);
      if (f.hint) process.stderr.write(`  hint:   ${f.hint}\n`);
      process.exit(1);
    }
  })();
} else {
  program.parseAsync(process.argv).catch(async (err: unknown) => {
    const { formatError } = await import("../core/error-format.js");
    const f = formatError(err);
    console.error(`amaco: ${f.title}`);
    if (f.detail && f.detail !== f.title) console.error(`  detail: ${f.detail}`);
    if (f.hint) console.error(`  hint:   ${f.hint}`);
    process.exit(1);
  });
}
