import { detectProject } from "../../../project/project-detector.js";
import { discoverFlows } from "../../../flows/catalog/flow-discovery.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runFlowsList(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  const flows = await discoverFlows(detected.projectRoot);

  if (opts.json) {
    console.log(JSON.stringify({ flows }, null, 2));
    return 0;
  }

  if (flows.length === 0) {
    console.log(`${symbol.warn()} No Flows discovered.`);
    return 0;
  }

  console.log(header("Discovered Flows:"));
  console.log("");
  for (const flow of flows) {
    console.log(
      `${color.bold(flow.label)} ${color.dim(`(${flow.id}@${flow.version}, ${flow.source.kind})`)}`,
    );
    console.log(indent(color.dim(flow.description)));
    if (flow.definitionPath) console.log(indent(color.dim(flow.definitionPath)));
    console.log("");
  }
  console.log(
    color.dim(
      "Use `amaco flows show <id>` to inspect slots and ordered steps.",
    ),
  );
  return 0;
}
