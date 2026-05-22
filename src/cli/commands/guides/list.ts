import { detectProject } from "../../../project/project-detector.js";
import { discoverGuides } from "../../../guides/guide-discovery.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runGuidesList(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  const guides = await discoverGuides(detected.projectRoot);

  if (opts.json) {
    console.log(JSON.stringify({ guides }, null, 2));
    return 0;
  }

  if (guides.length === 0) {
    console.log(`${symbol.warn()} No Guides discovered.`);
    return 0;
  }

  console.log(header("Discovered Guides:"));
  console.log("");
  for (const guide of guides) {
    console.log(
      `${color.bold(guide.label)} ${color.dim(`(${guide.id}@${guide.version}, ${guide.source.kind})`)}`,
    );
    console.log(indent(color.dim(guide.description)));
    if (guide.definitionPath) console.log(indent(color.dim(guide.definitionPath)));
    console.log("");
  }
  console.log(
    color.dim(
      "Use `amaco guides show <id>` to inspect slots and ordered steps.",
    ),
  );
  return 0;
}
