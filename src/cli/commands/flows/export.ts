import fs from "node:fs/promises";
import path from "node:path";
import { detectProject } from "../../../project/project-detector.js";
import { exportFlowYaml } from "../../../flows/runtime/flow-portability.js";
import { color, symbol } from "../../ui/format.js";

export async function runFlowsExport(
  flowId: string,
  opts: { out?: string; json?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const result = await exportFlowYaml({
    projectRoot: detected.projectRoot,
    flowId,
  });
  if (!result.ok) {
    console.error(color.red(result.reasons.join("\n")));
    return 1;
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        { flowId: result.flowId, source: result.source, yaml: result.yaml },
        null,
        2,
      ),
    );
    return 0;
  }

  if (opts.out) {
    const out = path.resolve(process.cwd(), opts.out);
    await fs.writeFile(out, result.yaml, "utf8");
    console.log(`${symbol.ok()} exported ${result.flowId} to ${out}.`);
    return 0;
  }

  process.stdout.write(result.yaml.endsWith("\n") ? result.yaml : `${result.yaml}\n`);
  return 0;
}
