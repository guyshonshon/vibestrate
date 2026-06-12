import { Command } from "commander";
import { runConfigShow } from "./show.js";
import { runConfigView } from "./view.js";
import { runConfigGet } from "./get.js";
import { runConfigSet } from "./set.js";
import { runConfigValidate } from "./validate.js";
import { runConfigKeys } from "./keys.js";
import { configLeafKeys } from "../../../project/config-introspection.js";

export function buildConfigCommand(): Command {
  const cmd = new Command("config").description(
    "Show and edit .vibestrate/project.yml without hand-editing YAML.",
  );

  cmd
    .command("view")
    .description(
      "Readable, grouped view of the config - each section shows where it's editable.",
    )
    .option("--json", "emit the structured view as JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runConfigView({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("show")
    .description("Print the raw config YAML and validate it.")
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

  const setCmd = cmd
    .command("set <path> <value>")
    .description(
      'Set a config value. Booleans/numbers/strings parsed automatically; arrays/objects via JSON (e.g. \'vibe config set commands.validate "[\\"pnpm test\\"]"\').',
    )
    .action(async (path: string, value: string) => {
      const code = await runConfigSet(path, value);
      process.exit(code);
    });
  // Schema-driven help (T8): list the actual settable keys + their types/enums
  // straight from the Zod schema, so `config set --help` enumerates reality.
  setCmd.addHelpText("after", () => {
    const keys = configLeafKeys();
    const width = Math.min(40, Math.max(...keys.map((k) => k.fullKey.length)));
    const lines = keys.map((k) => {
      const enumNote = k.enum?.length ? `  one of: ${k.enum.join(" | ")}` : "";
      return `  ${k.fullKey.padEnd(width)}  ${k.type}${enumNote}`;
    });
    return `\nSettable keys (from the schema; \`vibe config keys [filter]\` for defaults):\n${lines.join("\n")}`;
  });

  cmd
    .command("keys [filter]")
    .description(
      "List every settable config key with its type, allowed values, and default (from the schema).",
    )
    .action((filter: string | undefined) => {
      process.exit(runConfigKeys(filter));
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
