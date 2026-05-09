import { detectProject } from "../../../project/project-detector.js";
import { setConfigValue } from "../../../setup/config-update-service.js";
import { configExists } from "../../../project/config-loader.js";
import { color, indent, symbol } from "../../ui/format.js";
import { isAmacoError } from "../../../utils/errors.js";

export async function runConfigSet(pathArg: string, value: string): Promise<number> {
  if (!pathArg) {
    console.error(
      `${symbol.fail()} A config path is required. Example: ${color.bold('amaco config set workflow.maxReviewLoops 3')}`,
    );
    return 1;
  }
  if (value === undefined || value === null) {
    console.error(
      `${symbol.fail()} A value is required. Example: ${color.bold('amaco config set commands.validate "[\\"pnpm typecheck\\"]"')}`,
    );
    return 1;
  }
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Amaco config found. Run ${color.bold("amaco init")} first.`,
    );
    return 1;
  }
  try {
    const result = await setConfigValue(detected.projectRoot, pathArg, value);
    console.log(`${symbol.ok()} Updated ${color.bold(pathArg)}.`);
    console.log(indent(`Old value: ${formatValue(result.oldValue)}`));
    console.log(indent(`New value: ${formatValue(result.newValue)}`));
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "(unset)";
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v);
}
