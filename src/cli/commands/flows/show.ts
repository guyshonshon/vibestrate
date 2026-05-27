import { detectProject } from "../../../project/project-detector.js";
import {
  discoverFlows,
  findFlowById,
} from "../../../flows/catalog/flow-discovery.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runFlowsShow(
  flowId: string,
  opts: { json?: boolean } = {},
): Promise<number> {
  if (!flowId) {
    console.error(
      `${symbol.fail()} Flow id is required. Try ${color.bold("amaco flows list")}.`,
    );
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const flow = await findFlowById(detected.projectRoot, flowId);
  if (!flow) {
    const ids = (await discoverFlows(detected.projectRoot)).map((item) => item.id);
    console.error(
      `${symbol.fail()} No Flow named "${flowId}". Found: ${ids.join(", ") || "(none)"}.`,
    );
    return 1;
  }

  if (opts.json) {
    console.log(JSON.stringify({ flow }, null, 2));
    return 0;
  }

  console.log(header(flow.label));
  console.log(indent(color.dim(`id: ${flow.id}`)));
  console.log(indent(color.dim(`version: ${flow.version}`)));
  console.log(indent(color.dim(`source: ${flow.source.kind}`)));
  if (flow.definitionPath) {
    console.log(indent(color.dim(`path: ${flow.definitionPath}`)));
  }
  console.log("");
  console.log(flow.description);
  console.log("");
  console.log(color.bold("Slots"));
  for (const [slotId, slot] of Object.entries(flow.definition.slots)) {
    console.log(
      indent(`${slotId}: ${slot.label} ${color.dim(`(default agent ${slot.defaultRole})`)}`),
    );
  }
  console.log("");
  console.log(color.bold("Steps"));
  for (const [index, step] of flow.definition.steps.entries()) {
    const slot = step.slot ? ` via ${step.slot}` : "";
    const optional = step.optional ? " optional" : "";
    const repeat = step.repeat ? ` repeat x${step.repeat.times}` : "";
    const gate = step.approval
      ? ` gate ${step.approval.riskLevel}`
      : "";
    console.log(
      indent(
        `${index + 1}. ${step.id}: ${step.label} ${color.dim(`(${step.kind}${slot}${optional}${repeat}${gate})`)}`,
      ),
    );
  }
  return 0;
}
