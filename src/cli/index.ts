#!/usr/bin/env node
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Single source of truth for the version: package.json. The bundler
// (tsup/esbuild) inlines this at build time, and `npm version patch`
// updates it in one place - flowing into `vibe --version` and the
// generated docs reference automatically.
import pkg from "../../package.json";
import { renderBanner } from "./ui/banner.js";
import { runInitCommand } from "./commands/init.js";
import { runRunCommand } from "./commands/run.js";
import { runStatusCommand } from "./commands/status.js";
import { runAbortCommand } from "./commands/abort.js";
import { runRunsPrune } from "./commands/runs-prune.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runSetupCommand } from "./commands/setup.js";
import { runUiCommand } from "./commands/ui.js";
import { buildProviderCommand } from "./commands/provider/index.js";
import { buildConfigCommand } from "./commands/config/index.js";
import { buildSkillsCommand } from "./commands/skills/index.js";
import { buildFlowsCommand } from "./commands/flows/index.js";
import { buildSupervisorCommand } from "./commands/supervisor.js";
import { buildProfilesCommand } from "./commands/profiles/index.js";
import { buildParamsCommand } from "./commands/params/index.js";
import { buildCrewCommand } from "./commands/crew.js";
import { buildApprovalsCommand } from "./commands/approvals/index.js";
import { buildRoadmapCommand } from "./commands/roadmap.js";
import { buildTasksCommand } from "./commands/tasks.js";
import { buildIntegrateCommand } from "./commands/integrate.js";
import { buildQueueCommand } from "./commands/queue.js";
import { buildDocsCommand } from "./commands/docs.js";
import { buildLogsCommand } from "./commands/logs.js";
import { buildTelemetryCommand } from "./commands/telemetry.js";
import { buildWorkspaceCommand } from "./commands/workspace.js";
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
import { buildAssuranceCommand } from "./commands/assurance.js";
import { buildAuditCommand } from "./commands/audit.js";
import { buildPathCommand } from "./commands/path.js";
import { buildRenameCommand } from "./commands/rename.js";
import { buildLedgerCommand } from "./commands/ledger.js";
import { buildBudgetCommand } from "./commands/budget.js";
import { buildConsultCommand } from "./commands/consult.js";
import { buildSpecUpCommand } from "./commands/spec-up.js";
import { buildGuideCommand } from "./commands/guide.js";
import { buildReplayCommand } from "./commands/replay.js";
import { buildPauseCommand, buildResumeCommand } from "./commands/pause.js";
import { buildShellCommand } from "./commands/shell.js";

function collectStepProfile(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function collectFlowStep(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** `--param key=value` collector: builds a name -> raw-string record. */
function collectParam(
  value: string,
  previous: Record<string, string>,
): Record<string, string> {
  const eq = value.indexOf("=");
  if (eq <= 0) {
    throw new Error(`--param must be key=value (got "${value}").`);
  }
  return { ...previous, [value.slice(0, eq)]: value.slice(eq + 1) };
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
      "Vibestrate - local-first autonomous multi-agent completion orchestrator. Runs your local agent CLIs through plan → architect → implement → validate → review → fix → verify in isolated git worktrees.",
    )
    .version(pkg.version);

  // Purple ASCII banner above the *root* help only (not subcommand help).
  program.addHelpText("beforeAll", (ctx) =>
    ctx.command === program ? `\n${renderBanner()}\n` : "",
  );

  program
    .command("init")
    .description("Initialize Vibestrate in the current project (.vibestrate/ scaffold).")
    .option("-f, --force", "re-scaffold / overwrite existing config files to repair a broken project (runs are preserved)")
    .option("--yes", "non-interactive: use safe detected defaults, never wait for input")
    .option("--interactive", "force the flowd wizard even when --yes would default to non-interactive")
    .option(
      "--git-init",
      "if the directory isn't a git repo, create one (starter .gitignore; initial commit only when no secret-like files would be swept). Never implied by --yes.",
    )
    .action(async (opts: { force?: boolean; yes?: boolean; interactive?: boolean; gitInit?: boolean }) => {
      const code = await runInitCommand({
        force: opts.force,
        yes: opts.yes,
        interactive: opts.interactive,
        gitInit: opts.gitInit,
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
  program.addCommand(buildSupervisorCommand());
  program.addCommand(buildProfilesCommand());
  program.addCommand(buildParamsCommand());
  program.addCommand(buildCrewCommand());
  program.addCommand(buildApprovalsCommand());
  program.addCommand(buildRoadmapCommand());
  program.addCommand(buildSpecUpCommand());
  program.addCommand(buildTasksCommand());
  program.addCommand(buildIntegrateCommand());
  program.addCommand(buildQueueCommand());
  program.addCommand(buildDocsCommand());
  program.addCommand(buildLogsCommand());
  program.addCommand(buildTelemetryCommand());
  program.addCommand(buildWorkspaceCommand());
  program.addCommand(buildNotificationsCommand());
  program.addCommand(buildGatewaysCommand());
  program.addCommand(buildEditorCommand());
  program.addCommand(buildSuggestionsCommand());
  program.addCommand(buildBundlesCommand());
  program.addCommand(buildValidationCommand());
  program.addCommand(buildTerminalCommand());
  program.addCommand(buildPoliciesCommand());
  program.addCommand(buildAssuranceCommand());
  program.addCommand(buildAuditCommand());
  program.addCommand(buildPathCommand());
  program.addCommand(buildRenameCommand());
  program.addCommand(buildLedgerCommand());
  program.addCommand(buildConsultCommand());
  program.addCommand(buildGuideCommand());
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
      "--permission-mode <mode>",
      "permission mode: read-only | ask (approve each change) | accept-edits (auto-apply, then hold for your sign-off before completing) | auto (default). --read-only is the alias for read-only.",
    )
    .option(
      "--unattended",
      "never pause for a human: forces budget onLimit->stop and resilience onExhausted->fail, so the run always terminates on its own.",
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
      "--supervisor <id>",
      "supervisor persona (judgment posture) for this run; default = project.defaultPersona.",
    )
    .option(
      "--select",
      "let the orchestrator pick the Flow even when a default flow is set.",
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
      "--param <key=value>",
      "set a flow parameter (for a flow that declares `params:`). Repeatable.",
      collectParam,
      {},
    )
    .option(
      "-i, --interactive",
      "interactively pick the Flow and Crew you didn't pass (horizontal selector), then run. With --flow, opens that flow's detailed setup instead.",
    )
    .option(
      "--resume-from <runId>",
      "rewind: fork from a prior run, reusing its plan (+ architecture) instead of regenerating them.",
    )
    .option(
      "--resume-stage <stage>",
      "stage to resume at with --resume-from: planning | architecting | executing (regenerate code) | reviewing | fixing | verifying (restore the source run's code snapshot). Default: executing.",
    )
    .option(
      "--preview",
      "dry-run a downstream rewind: print the files the restore would overwrite/remove (vs the worktree base), then exit without starting a run. Use with --resume-from.",
    )
    .option(
      "--checklist <mode>",
      "pick-up execution over the linked task's checklist: continuous | step. Needs --task and a checklist-aware flow (--flow pickup).",
    )
    .option(
      "--context-file <path>",
      "attach a project file as context for every agent (repeatable; path-guarded, secrets redacted).",
      collectFlowStep,
      [],
    )
    .option(
      "--context-url <url>",
      "attach an http(s) URL as context (repeatable; SSRF-guarded, bounded, secrets redacted).",
      collectFlowStep,
      [],
    )
    .action(
      async (
        taskParts: string[] = [],
        opts: {
          ui?: boolean;
          uiPort?: number;
          task?: string;
          crew?: string;
          profile?: string;
          readOnly?: boolean;
          permissionMode?: string;
          unattended?: boolean;
          skills?: string;
          concise?: boolean;
          flow?: string;
          supervisor?: string;
          select?: boolean;
          stepProfile?: string[];
          seatRole?: string[];
          flowBrief?: string;
          flowContext?: string;
          flowSkip?: string[];
          param?: Record<string, string>;
          interactive?: boolean;
          resumeFrom?: string;
          resumeStage?: string;
          preview?: boolean;
          checklist?: string;
          contextFile?: string[];
          contextUrl?: string[];
        },
      ) => {
        const task = taskParts.join(" ").trim();
        const contextSources = [
          ...(opts.contextFile ?? []).map((ref) => ({ kind: "file" as const, ref })),
          ...(opts.contextUrl ?? []).map((ref) => ({ kind: "url" as const, ref })),
        ];
        if (
          opts.permissionMode &&
          !["read-only", "ask", "accept-edits", "auto"].includes(opts.permissionMode)
        ) {
          console.error(
            `--permission-mode must be one of read-only|ask|accept-edits|auto (got "${opts.permissionMode}").`,
          );
          process.exit(2);
        }
        let checklistMode: "continuous" | "step" | null = null;
        if (opts.checklist) {
          if (opts.checklist !== "continuous" && opts.checklist !== "step") {
            console.error(
              `--checklist must be one of continuous|step (got "${opts.checklist}").`,
            );
            process.exit(2);
          }
          if (!opts.task) {
            console.error("--checklist requires --task <id> (it iterates that task's checklist).");
            process.exit(2);
          }
          checklistMode = opts.checklist;
        }
        const RESUME_STAGES = [
          "planning",
          "architecting",
          "executing",
          "reviewing",
          "fixing",
          "verifying",
        ] as const;
        let resumeStage: (typeof RESUME_STAGES)[number] | undefined;
        if (opts.resumeStage) {
          if (!RESUME_STAGES.includes(opts.resumeStage as (typeof RESUME_STAGES)[number])) {
            console.error(
              `--resume-stage must be one of ${RESUME_STAGES.join("|")} (got "${opts.resumeStage}").`,
            );
            process.exit(2);
          }
          resumeStage = opts.resumeStage as (typeof RESUME_STAGES)[number];
        }
        if (opts.resumeStage && !opts.resumeFrom) {
          console.error("--resume-stage requires --resume-from <runId>.");
          process.exit(2);
        }
        if (opts.preview && !opts.resumeFrom) {
          console.error("--preview requires --resume-from <runId>.");
          process.exit(2);
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
            (opts.flowSkip?.length ?? 0) > 0)
        ) {
          console.error("--flow-*/--step-profile options require --flow <id>.");
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
          crewId: opts.crew ?? null,
          seatRoleOverrides,
          profileOverride: opts.profile ?? null,
          readOnly: opts.readOnly ?? false,
          permissionMode: opts.permissionMode as
            | "read-only"
            | "ask"
            | "accept-edits"
            | "auto"
            | undefined,
          unattended: opts.unattended ?? false,
          runtimeSkills,
          concise: opts.concise ?? false,
          params: opts.param ?? {},
          flowId: opts.flow ?? null,
          supervisorId: opts.supervisor ?? null,
          select: opts.select === true,
          flowStepProfiles,
          flowBrief: opts.flowBrief ?? null,
          flowContextPolicy,
          flowSkippedOptionalSteps: opts.flowSkip ?? [],
          flowInteractive: opts.interactive ?? false,
          resumeFromRunId: opts.resumeFrom ?? null,
          resumeStage,
          previewRestore: opts.preview ?? false,
          checklistMode,
          contextSources,
        });
        process.exit(code);
      },
    );

  program
    .command("ui")
    .description("Start the local supervisor dashboard for this project.")
    .option("--port <port>", "port to bind (default 4317)", (v) => parseInt(v, 10))
    .option(
      "--host <host>",
      "bind host (default 127.0.0.1). A non-loopback host exposes the API on the network and requires VIBESTRATE_API_TOKEN.",
    )
    .option(
      "--no-open",
      "don't open the dashboard in your default browser on startup (default: open).",
    )
    .option(
      "--no-scheduler",
      "don't start the managed scheduler subprocess (default: on; the UI owns its lifecycle).",
    )
    .action(
      async (opts: {
        port?: number;
        host?: string;
        open?: boolean;
        scheduler?: boolean;
      }) => {
        const code = await runUiCommand({
          port: opts.port,
          host: opts.host,
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

  const runs = program
    .command("runs")
    .description("Manage runs and their rewind snapshots.");
  runs
    .command("prune")
    .description(
      "Delete rewind-snapshot refs you choose to drop: orphans (run dir gone), beyond a keep-N window, or one run. Shows the plan and confirms first; never purges on its own.",
    )
    .option("--keep <n>", "keep the N most-recent runs' snapshots, prune the rest")
    .option("--orphans", "prune refs whose run directory is gone (default when no other scope is given)")
    .option("--run <runId>", "prune one specific run's snapshots")
    .option("--dry-run", "show what would be pruned, delete nothing")
    .option("-y, --yes", "skip the confirmation prompt")
    .action(
      async (opts: {
        keep?: string;
        orphans?: boolean;
        run?: string;
        dryRun?: boolean;
        yes?: boolean;
      }) => {
        let keep: number | null = null;
        if (opts.keep !== undefined) {
          const n = Number(opts.keep);
          if (!Number.isInteger(n) || n < 0) {
            console.error(`--keep must be a non-negative integer (got "${opts.keep}").`);
            process.exit(2);
          }
          keep = n;
        }
        const code = await runRunsPrune({
          keep,
          // Leave undefined when the flag is absent so runRunsPrune can apply
          // its "orphans by default when no other scope" rule.
          orphans: opts.orphans,
          run: opts.run ?? null,
          dryRun: opts.dryRun ?? false,
          yes: opts.yes ?? false,
        });
        process.exit(code);
      },
    );

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
