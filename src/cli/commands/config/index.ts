import { Command } from "commander";
import { runConfigShow } from "./show.js";
import { runConfigGet } from "./get.js";
import { runConfigSet } from "./set.js";
import { runConfigValidate } from "./validate.js";

export function buildConfigCommand(): Command {
  const cmd = new Command("config").description(
    "Show and edit .vibestrate/project.yml without hand-editing YAML.",
  );

  cmd
    .command("show")
    .description("Print the current config and validate it.")
    .option("--json", "emit parsed JSON instead of YAML")
    .action(async (opts: { json?: boolean }) => {
      const code = await runConfigShow({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("get <path>")
    .description("Print a single config value (dot-path, e.g. commands.validate).")
    .option("--json", "emit JSON")
    .action(async (path: string, opts: { json?: boolean }) => {
      const code = await runConfigGet(path, { json: opts.json });
      process.exit(code);
    });

  cmd
    .command("set <path> <value>")
    .description(
      'Set a config value. Booleans/numbers/strings parsed automatically; arrays/objects via JSON (e.g. \'vibe config set commands.validate "[\\"pnpm test\\"]"\').',
    )
    .action(async (path: string, value: string) => {
      const code = await runConfigSet(path, value);
      process.exit(code);
    });

  cmd
    .command("validate")
    .description("Validate the project.yml file against the Vibestrate schema.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runConfigValidate({ json: opts.json });
      process.exit(code);
    });

  return cmd;
}
