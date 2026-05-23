import { detectProject } from "../../../project/project-detector.js";
import {
  suggestGuidesForProject,
  type GuideSuggestionRisk,
} from "../../../guides/runtime/guide-suggestion.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runGuidesSuggest(
  taskParts: string[],
  opts: {
    files?: string[];
    json?: boolean;
    risk?: GuideSuggestionRisk;
  } = {},
): Promise<number> {
  const task = taskParts.join(" ").trim();
  if (!task) {
    console.error(`${symbol.fail()} Task text is required.`);
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const suggestions = await suggestGuidesForProject({
    projectRoot: detected.projectRoot,
    task,
    files: opts.files,
    riskLevel: opts.risk,
  });

  if (opts.json) {
    console.log(JSON.stringify({ suggestions }, null, 2));
    return 0;
  }

  if (suggestions.length === 0) {
    console.log(
      `${symbol.bullet()} No Guide suggestion is strong enough. Use ${color.bold("default workflow")} or choose from ${color.bold("amaco guides list")}.`,
    );
    return 0;
  }

  console.log(header("Suggested Guides:"));
  console.log("");
  for (const suggestion of suggestions) {
    console.log(
      `${symbol.arrow()} ${color.bold(suggestion.label)} ${color.dim(`(${suggestion.guideId}, confidence ${suggestion.confidence})`)}`,
    );
    for (const reason of suggestion.reasons.slice(0, 4)) {
      console.log(indent(color.dim(`- ${reason}`)));
    }
    console.log("");
  }
  console.log(
    color.dim(
      "Suggestions never start a Guide automatically. Pass `amaco run \"task\" --guide <id>` to use one.",
    ),
  );
  return 0;
}
