import { detectProject } from "../../../project/project-detector.js";
import {
  suggestFlowsForProject,
  type FlowSuggestionRisk,
} from "../../../flows/runtime/flow-suggestion.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runFlowsSuggest(
  taskParts: string[],
  opts: {
    files?: string[];
    json?: boolean;
    risk?: FlowSuggestionRisk;
  } = {},
): Promise<number> {
  const task = taskParts.join(" ").trim();
  if (!task) {
    console.error(`${symbol.fail()} Task text is required.`);
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const suggestions = await suggestFlowsForProject({
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
      `${symbol.bullet()} No flow suggestion is strong enough. Run plain ${color.bold("vibe run")} for the default flow, or choose from ${color.bold("vibe flows list")}.`,
    );
    return 0;
  }

  console.log(header("Suggested Flows:"));
  console.log("");
  for (const suggestion of suggestions) {
    console.log(
      `${symbol.arrow()} ${color.bold(suggestion.label)} ${color.dim(`(${suggestion.flowId}, confidence ${suggestion.confidence})`)}`,
    );
    for (const reason of suggestion.reasons.slice(0, 4)) {
      console.log(indent(color.dim(`- ${reason}`)));
    }
    console.log("");
  }
  console.log(
    color.dim(
      "Suggestions never start a Flow automatically. Pass `vibe run \"task\" --flow <id>` to use one.",
    ),
  );
  return 0;
}
