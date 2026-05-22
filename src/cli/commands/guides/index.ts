import { Command } from "commander";
import { runGuidesList } from "./list.js";
import { runGuidesShow } from "./show.js";

export function buildGuidesCommand(): Command {
  const cmd = new Command("guides").description(
    "List and inspect Guide run recipes from built-ins and .amaco/guides.",
  );

  cmd
    .command("list")
    .description("Show every discovered Guide.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runGuidesList({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("show <id>")
    .description("Print a Guide's participant slots and ordered steps.")
    .option("--json", "emit JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      const code = await runGuidesShow(id, { json: opts.json });
      process.exit(code);
    });

  return cmd;
}
