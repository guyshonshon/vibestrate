import { Command } from "commander";
import { runProviderDetect } from "./detect.js";
import { runProviderList } from "./list.js";
import { runProviderTest } from "./test.js";
import { runProviderSet } from "./set.js";
import { runProviderSetup } from "./setup.js";
import { runProviderRemove } from "./remove.js";
import { runProviderCatalog } from "./catalog.js";
import { runProviderRefresh } from "./refresh.js";

export function buildProviderCommand(): Command {
  const cmd = new Command("provider").description(
    "Inspect, configure, and test local coding-CLI providers.",
  );

  cmd
    .command("detect")
    .description("Scan PATH for known local coding CLIs (claude/codex/opencode/aider/ollama).")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runProviderDetect({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("list")
    .description("Show providers configured in this project.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runProviderList({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("test [providerId]")
    .description(
      "Send a tiny no-op prompt to a configured provider and look for the magic token.",
    )
    .option("--yes", "skip confirmation prompt (non-interactive)")
    .action(async (providerId: string | undefined, opts: { yes?: boolean }) => {
      const code = await runProviderTest(providerId, { yes: opts.yes });
      process.exit(code);
    });

  cmd
    .command("set <providerId>")
    .description("Assign every default agent to use the given provider.")
    .option("--yes", "skip confirmation prompts when adding a detected provider")
    .action(async (providerId: string, opts: { yes?: boolean }) => {
      const code = await runProviderSet(providerId, { yes: opts.yes });
      process.exit(code);
    });

  cmd
    .command("setup")
    .description("Flowd provider setup wizard.")
    .action(async () => {
      const code = await runProviderSetup();
      process.exit(code);
    });

  cmd
    .command("remove <providerId>")
    .description("Remove a provider from project.yml (refuses if a role still uses it).")
    .option("--yes", "skip the confirmation prompt (non-interactive)")
    .action(async (providerId: string, opts: { yes?: boolean }) => {
      const code = await runProviderRemove(providerId, { yes: opts.yes });
      process.exit(code);
    });

  cmd
    .command("catalog")
    .description(
      "Show the provider capability catalog (built-in + your .vibestrate/providers-catalog.yml overlay).",
    )
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runProviderCatalog({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("refresh [providerId]")
    .description(
      "Detect each provider's real models/efforts (codex `debug models` JSON, else --help scraping) and write them to the catalog overlay. Refreshes stale built-in lists; local only.",
    )
    .option("--force", "replace existing overlay/built-in entries instead of gap-filling")
    .option("--dry-run", "show what would be written without writing")
    .action(
      async (providerId: string | undefined, opts: { force?: boolean; dryRun?: boolean }) => {
        const code = await runProviderRefresh(providerId, {
          force: opts.force,
          dryRun: opts.dryRun,
        });
        process.exit(code);
      },
    );

  return cmd;
}
