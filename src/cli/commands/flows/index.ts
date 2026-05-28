import { Command } from "commander";
import path from "node:path";
import { runFlowsList } from "./list.js";
import { runFlowsShow } from "./show.js";
import { runFlowsSuggest } from "./suggest.js";
import { detectProject } from "../../../project/project-detector.js";
import {
  exportFlowArbitrationDataset,
  FlowArbitrationExportError,
} from "../../../flows/runtime/flow-arbitration-export.js";
import { writeJson } from "../../../utils/json.js";
import { color, symbol } from "../../ui/format.js";

export function buildFlowsCommand(): Command {
  const cmd = new Command("flows").description(
    "List and inspect Flow run recipes from built-ins and .vibestrate/flows.",
  );

  cmd
    .command("list")
    .description("Show every discovered Flow.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      const code = await runFlowsList({ json: opts.json });
      process.exit(code);
    });

  cmd
    .command("show <id>")
    .description("Print a Flow's participant slots and ordered steps.")
    .option("--json", "emit JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      const code = await runFlowsShow(id, { json: opts.json });
      process.exit(code);
    });

  cmd
    .command("suggest <task...>")
    .description("Suggest a Flow from task risk signals and local Flow outcomes.")
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
        const code = await runFlowsSuggest(taskParts, {
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
        const dataset = await exportFlowArbitrationDataset({
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
        if (err instanceof FlowArbitrationExportError) {
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
