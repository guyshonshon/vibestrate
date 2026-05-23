import { Command } from "commander";
import path from "node:path";
import { runGuidesList } from "./list.js";
import { runGuidesShow } from "./show.js";
import { runGuidesSuggest } from "./suggest.js";
import { detectProject } from "../../../project/project-detector.js";
import {
  exportGuideArbitrationDataset,
  GuideArbitrationExportError,
} from "../../../guides/runtime/guide-arbitration-export.js";
import { writeJson } from "../../../utils/json.js";
import { color, symbol } from "../../ui/format.js";

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

  cmd
    .command("suggest <task...>")
    .description("Suggest a Guide from task risk signals and local Guide outcomes.")
    .option("--file <path>", "known touched file path; repeat for more", collect, [])
    .option("--risk <level>", "task risk level: low, medium, or high")
    .option("--json", "emit JSON")
    .action(
      async (
        taskParts: string[],
        opts: {
          file?: string[];
          risk?: "low" | "medium" | "high";
          json?: boolean;
        },
      ) => {
        const code = await runGuidesSuggest(taskParts, {
          files: opts.file,
          risk: opts.risk,
          json: opts.json,
        });
        process.exit(code);
      },
    );

  cmd
    .command("export-arbitration <runId>")
    .description(
      "Export a Quality Arbitration run as local JSON evidence for later evaluation.",
    )
    .option("--out <file>", "write the JSON export to a local file")
    .action(async (runId: string, opts: { out?: string }) => {
      try {
        const detected = await detectProject(process.cwd());
        const dataset = await exportGuideArbitrationDataset({
          projectRoot: detected.projectRoot,
          runId,
        });
        if (opts.out) {
          const out = path.resolve(process.cwd(), opts.out);
          await writeJson(out, dataset);
          console.log(`${symbol.ok()} exported ${runId} to ${out}.`);
          return;
        }
        process.stdout.write(`${JSON.stringify(dataset, null, 2)}\n`);
      } catch (err) {
        if (err instanceof GuideArbitrationExportError) {
          console.error(color.red(err.message));
          process.exit(1);
        }
        throw err;
      }
    });

  return cmd;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
