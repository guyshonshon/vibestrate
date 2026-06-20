import { detectProject } from "../../../project/project-detector.js";
import { discoverFlowCatalog } from "../../../flows/catalog/flow-discovery.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runFlowsList(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  const catalog = await discoverFlowCatalog(detected.projectRoot);
  // Hidden flows (internal Shape phase) are not user-selectable - omit from the list.
  const flows = catalog.flows.filter((f) => !f.definition.hidden);
  const { invalid } = catalog;

  if (opts.json) {
    console.log(JSON.stringify({ flows, invalid }, null, 2));
    return 0;
  }

  if (flows.length === 0) {
    console.log(`${symbol.warn()} No Flows discovered.`);
  } else {
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
        "Use `vibe flows show <id>` to inspect slots and ordered steps.",
      ),
    );
  }

  if (invalid.length > 0) {
    console.log("");
    console.log(`${symbol.warn()} ${invalid.length} project flow(s) could not be loaded:`);
    for (const bad of invalid) {
      console.log(indent(`${color.bold(bad.path)}`));
      console.log(indent(color.dim(bad.message)));
    }
  }
  return invalid.length > 0 ? 1 : 0;
}
