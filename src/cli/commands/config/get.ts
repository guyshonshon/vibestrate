import { detectProject } from "../../../project/project-detector.js";
import { getConfigValue } from "../../../setup/config-update-service.js";
import { configExists } from "../../../project/config-loader.js";
import { color, symbol } from "../../ui/format.js";
import { isAmacoError } from "../../../utils/errors.js";

export async function runConfigGet(
  pathArg: string,
  opts: { json?: boolean },
): Promise<number> {
  if (!pathArg) {
    console.error(
      `${symbol.fail()} A config path is required. Example: ${color.bold("amaco config get commands.validate")}`,
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
    const result = await getConfigValue(detected.projectRoot, pathArg);
    if (!result.found) {
      if (opts.json) {
        console.log("null");
      } else {
        console.log(`${symbol.warn()} ${result.reason}`);
      }
      return 1;
    }
    if (opts.json) {
      console.log(JSON.stringify(result.value, null, 2));
    } else if (typeof result.value === "string") {
      console.log(result.value);
    } else {
      console.log(JSON.stringify(result.value, null, 2));
    }
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}
