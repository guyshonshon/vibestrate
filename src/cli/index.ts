#!/usr/bin/env node
import { Command } from "commander";
import { runInitCommand } from "./commands/init.js";
import { runRunCommand } from "./commands/run.js";
import { runStatusCommand } from "./commands/status.js";
import { runAbortCommand } from "./commands/abort.js";
import { runDoctorCommand } from "./commands/doctor.js";

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
  .option("--force", "overwrite existing config files")
  .action(async (opts: { force?: boolean }) => {
    const code = await runInitCommand({ force: opts.force });
    process.exit(code);
  });

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
  .description("Check environment, config, and provider availability.")
  .action(async () => {
    const code = await runDoctorCommand();
    process.exit(code);
  });

program.showHelpAfterError();

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
