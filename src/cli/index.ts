#!/usr/bin/env node
import { Command } from "commander";
import { runInitCommand } from "./commands/init.js";
import { runRunCommand } from "./commands/run.js";
import { runStatusCommand } from "./commands/status.js";
import { runAbortCommand } from "./commands/abort.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runSetupCommand } from "./commands/setup.js";
import { buildProviderCommand } from "./commands/provider/index.js";
import { buildConfigCommand } from "./commands/config/index.js";

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

program
  .command("run <task...>")
  .description("Run the default plan→architect→implement→review→verify workflow.")
  .action(async (taskParts: string[]) => {
    const task = taskParts.join(" ").trim();
    const code = await runRunCommand(task);
    process.exit(code);
  });

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

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
