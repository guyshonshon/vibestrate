#!/usr/bin/env node
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Single source of truth for the version: package.json. The bundler
// (tsup/esbuild) inlines this at build time, and `npm version patch`
// updates it in one place — flowing into `vibe --version` and the
// generated docs reference automatically.
import pkg from "../../package.json";
import { renderBanner } from "./ui/banner.js";
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
import { buildFlowsCommand } from "./commands/flows/index.js";
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
import { buildBudgetCommand } from "./commands/budget.js";
import { buildReplayCommand } from "./commands/replay.js";
import { buildPauseCommand, buildResumeCommand } from "./commands/pause.js";
import { buildShellCommand } from "./commands/shell.js";

function collectStepProfile(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function collectFlowStep(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseStepProfiles(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of values) {
    const index = raw.indexOf("=");
    const step = raw.slice(0, index).trim();
    const profile = raw.slice(index + 1).trim();
    if (index <= 0 || !step || !profile) {
      throw new Error(
        `--step-profile must use <stepId=profileId> (got "${raw}").`,
      );
    }
    out[step] = profile;
  }
  return out;
}

function parseSeatRoles(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of values) {
    const index = raw.indexOf("=");
    const seat = raw.slice(0, index).trim();
    const role = raw.slice(index + 1).trim();
    if (index <= 0 || !seat || !role) {
      throw new Error(`--seat-role must use <seat=roleId> (got "${raw}").`);
    }
    out[seat] = role;
  }
  return out;
}

// Build the full commander program without parsing argv. Exported so the
// docs metadata generator can introspect the command tree, and so tests
// can construct a fresh program when needed. Kept side-effect-free.
export function buildVibestrateProgram(): Command {
  const program = new Command();

  program
    .name("vibe")
    .description(
      "Vibestrate — local-first autonomous multi-agent completion orchestrator. Runs your local agent CLIs through plan → architect → implement → validate → review → fix → verify in isolated git worktrees.",
    )
    .version(pkg.version);

  // Purple ASCII banner above the *root* help only (not subcommand help).
  program.addHelpText("beforeAll", (ctx) =>
    ctx.command === program ? `\n${renderBanner()}\n` : "",
  );

  program
    .command("init")
    .description("Initialize Vibestrate in the current project (.vibestrate/ scaffold).")
    .option("--force", "overwrite existing config files (runs are preserved)")
    .option("--yes", "non-interactive: use safe detected defaults, never wait for input")
    .option("--interactive", "force the flowd wizard even when --yes would default to non-interactive")
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
    .description("Flowd wizard for provider, validation commands, and run defaults.")
    .action(async () => {
      const code = await runSetupCommand();
      process.exit(code);
    });

  program.addCommand(buildProviderCommand());
  program.addCommand(buildConfigCommand());
  program.addCommand(buildSkillsCommand());
  program.addCommand(buildFlowsCommand());
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
  program.addCommand(buildBudgetCommand());
  program.addCommand(buildReplayCommand());
  program.addCommand(buildPauseCommand());
  program.addCommand(buildResumeCommand());
  program.addCommand(buildShellCommand());

  program
    .command("run [task...]")
    .description("Run the default plan→architect→implement→review→verify workflow.")
    .option("--ui", "start the local supervisor dashboard alongside the run")
    .option("--ui-port <port>", "port for the supervisor dashboard (default 4317)", (v) => parseInt(v, 10))
    .option(
      "--task <taskId>",
      "link this run to a roadmap task; updates task status and runIds.",
    )
    .option(
      "--effort <level>",
      "task-difficulty hint (low|medium|high). Recorded for planning; does not pick a provider.",
    )
    .option(
      "--crew <id>",
      "crew to resolve the flow's seats against (default: project.defaultCrew).",
    )
    .option(
      "--profile <id>",
      "run-wide Profile override applied to every seated step in this run.",
    )
    .option(
      "--read-only",
      "investigation-only run: skip executor + fix loop; refuse apply/validate/revert; force readOnly permissions on every role.",
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
    .option(
      "--flow <id>",
      "resolve and run a Flow recipe for this run.",
    )
    .option(
      "--step-profile <stepId=profileId>",
      "override the Profile for a Flow step (same Role, different runtime). Repeat for multiple steps.",
      collectStepProfile,
      [],
    )
    .option(
      "--seat-role <seat=roleId>",
      "pin a Role to a Seat when the crew has more than one role filling it. Repeat for multiple seats.",
      collectStepProfile,
      [],
    )
    .option(
      "--flow-brief <text>",
      "extra brief for the Flow task packet.",
    )
    .option(
      "--flow-context <policy>",
      "Flow context policy (balanced|compact|artifact-heavy).",
    )
    .option(
      "--flow-skip <step>",
      "skip an optional Flow step for this run. Repeat for multiple steps.",
      collectFlowStep,
      [],
    )
    .option(
      "--interactive",
      "open terminal Flow setup for task, brief, participants, and optional steps. Requires --flow.",
    )
    .option(
      "--resume-from <runId>",
      "rewind: fork from a prior run, reusing its plan (+ architecture) instead of regenerating them.",
    )
    .option(
      "--resume-stage <stage>",
      "stage to resume at with --resume-from: planning | architecting (reuse plan) | executing (reuse plan + architecture). Default: executing.",
    )
    .action(
      async (
        taskParts: string[] = [],
        opts: {
          ui?: boolean;
          uiPort?: number;
          task?: string;
          effort?: string;
          crew?: string;
          profile?: string;
          readOnly?: boolean;
          autoEffort?: boolean;
          skills?: string;
          concise?: boolean;
          flow?: string;
          stepProfile?: string[];
          seatRole?: string[];
          flowBrief?: string;
          flowContext?: string;
          flowSkip?: string[];
          interactive?: boolean;
          resumeFrom?: string;
          resumeStage?: string;
        },
      ) => {
        const task = taskParts.join(" ").trim();
        let resumeStage: "planning" | "architecting" | "executing" | undefined;
        if (opts.resumeStage) {
          if (
            opts.resumeStage !== "planning" &&
            opts.resumeStage !== "architecting" &&
            opts.resumeStage !== "executing"
          ) {
            console.error(
              `--resume-stage must be one of planning|architecting|executing (got "${opts.resumeStage}").` +
                (opts.resumeStage === "reviewing" || opts.resumeStage === "verifying"
                  ? " Resuming at reviewing/verifying isn't supported yet — it needs the executor's code, which Vibestrate doesn't snapshot per step."
                  : ""),
            );
            process.exit(2);
          }
          resumeStage = opts.resumeStage;
        }
        if (opts.resumeStage && !opts.resumeFrom) {
          console.error("--resume-stage requires --resume-from <runId>.");
          process.exit(2);
        }
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
        if (
          !opts.flow &&
          ((opts.stepProfile?.length ?? 0) > 0 ||
            !!opts.flowBrief ||
            !!opts.flowContext ||
            (opts.flowSkip?.length ?? 0) > 0 ||
            opts.interactive === true)
        ) {
          console.error("--flow-*/--step-profile options and run --interactive require --flow <id>.");
          process.exit(2);
        }
        let flowContextPolicy:
          | "balanced"
          | "compact"
          | "artifact-heavy"
          | undefined;
        if (opts.flowContext) {
          if (
            opts.flowContext !== "balanced" &&
            opts.flowContext !== "compact" &&
            opts.flowContext !== "artifact-heavy"
          ) {
            console.error(
              `--flow-context must be one of balanced|compact|artifact-heavy (got "${opts.flowContext}").`,
            );
            process.exit(2);
          }
          flowContextPolicy = opts.flowContext;
        }
        let flowStepProfiles: Record<string, string> = {};
        let seatRoleOverrides: Record<string, string> = {};
        try {
          flowStepProfiles = parseStepProfiles(opts.stepProfile ?? []);
          seatRoleOverrides = parseSeatRoles(opts.seatRole ?? []);
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }
        const code = await runRunCommand(task, {
          ui: opts.ui,
          uiPort: opts.uiPort,
          taskId: opts.task ?? null,
          effort,
          crewId: opts.crew ?? null,
          seatRoleOverrides,
          profileOverride: opts.profile ?? null,
          readOnly: opts.readOnly ?? false,
          autoEffort: opts.autoEffort ?? false,
          runtimeSkills,
          concise: opts.concise ?? false,
          flowId: opts.flow ?? null,
          flowStepProfiles,
          flowBrief: opts.flowBrief ?? null,
          flowContextPolicy,
          flowSkippedOptionalSteps: opts.flowSkip ?? [],
          flowInteractive: opts.interactive ?? false,
          resumeFromRunId: opts.resumeFrom ?? null,
          resumeStage,
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
    .description("List Vibestrate runs in this project.")
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

  return program;
}

// Only run the CLI when this module is executed as the main script (not
// when imported by the docs generator or by tests). We compare *realpaths*:
// when installed globally the `vibe` bin is a symlink, so process.argv[1]
// (the symlink, e.g. .../bin/vibe) differs from import.meta.url (the
// resolved module, .../dist/index.js). Resolving both through the symlink
// makes the comparison hold for direct runs, symlinked bins, and tsx dev.
const isMain = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  // `vibe` with no subcommand opens the interactive shell. Use `vibe --help`
  // (or any other subcommand) to opt out. We only treat *zero*
  // extra args as the shell trigger so `vibe --version` etc still work.
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
        process.stderr.write(`vibe: ${f.title}\n`);
        if (f.detail && f.detail !== f.title)
          process.stderr.write(`  detail: ${f.detail}\n`);
        if (f.hint) process.stderr.write(`  hint:   ${f.hint}\n`);
        process.exit(1);
      }
    })();
  } else {
    const program = buildVibestrateProgram();
    program.parseAsync(process.argv).catch(async (err: unknown) => {
      const { formatError } = await import("../core/error-format.js");
      const f = formatError(err);
      console.error(`vibe: ${f.title}`);
      if (f.detail && f.detail !== f.title) console.error(`  detail: ${f.detail}`);
      if (f.hint) console.error(`  hint:   ${f.hint}`);
      process.exit(1);
    });
  }
}
