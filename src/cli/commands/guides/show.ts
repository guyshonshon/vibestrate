import { detectProject } from "../../../project/project-detector.js";
import {
  discoverGuides,
  findGuideById,
} from "../../../guides/catalog/guide-discovery.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runGuidesShow(
  guideId: string,
  opts: { json?: boolean } = {},
): Promise<number> {
  if (!guideId) {
    console.error(
      `${symbol.fail()} Guide id is required. Try ${color.bold("amaco guides list")}.`,
    );
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const guide = await findGuideById(detected.projectRoot, guideId);
  if (!guide) {
    const ids = (await discoverGuides(detected.projectRoot)).map((item) => item.id);
    console.error(
      `${symbol.fail()} No Guide named "${guideId}". Found: ${ids.join(", ") || "(none)"}.`,
    );
    return 1;
  }

  if (opts.json) {
    console.log(JSON.stringify({ guide }, null, 2));
    return 0;
  }

  console.log(header(guide.label));
  console.log(indent(color.dim(`id: ${guide.id}`)));
  console.log(indent(color.dim(`version: ${guide.version}`)));
  console.log(indent(color.dim(`source: ${guide.source.kind}`)));
  if (guide.definitionPath) {
    console.log(indent(color.dim(`path: ${guide.definitionPath}`)));
  }
  console.log("");
  console.log(guide.description);
  console.log("");
  console.log(color.bold("Slots"));
  for (const [slotId, slot] of Object.entries(guide.definition.slots)) {
    console.log(
      indent(`${slotId}: ${slot.label} ${color.dim(`(default agent ${slot.defaultAgent})`)}`),
    );
  }
  console.log("");
  console.log(color.bold("Steps"));
  for (const [index, step] of guide.definition.steps.entries()) {
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
