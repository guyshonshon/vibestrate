import { detectProject } from "../../../project/project-detector.js";
import { showConfig } from "../../../setup/config-update-service.js";
import { configExists } from "../../../project/config-loader.js";
import { color, header, symbol } from "../../ui/format.js";
import { isVibestrateError } from "../../../utils/errors.js";

export async function runConfigShow(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }
  try {
    const r = await showConfig(detected.projectRoot);
    if (opts.json) {
      console.log(JSON.stringify(r.parsed ?? null, null, 2));
      return r.parsed ? 0 : 1;
    }
    console.log(header("Current Vibestrate config:"));
    console.log("");
    console.log(r.text);
    if (r.error) {
      console.error("");
      console.error(`${symbol.warn()} ${color.bold("Validation issues:")}`);
      console.error(r.error);
      return 1;
    }
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}
