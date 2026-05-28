import { detectProject } from "../../../project/project-detector.js";
import { validateConfigFile } from "../../../setup/config-update-service.js";
import { configExists } from "../../../project/config-loader.js";
import { color, symbol } from "../../ui/format.js";
import { isVibestrateError } from "../../../utils/errors.js";

export async function runConfigValidate(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }
  try {
    const r = await validateConfigFile(detected.projectRoot);
    if (opts.json) {
      console.log(
        JSON.stringify({ ok: r.ok, issues: r.issues }, null, 2),
      );
      return r.ok ? 0 : 1;
    }
    if (r.ok) {
      console.log(`${symbol.ok()} Config is valid.`);
      return 0;
    }
    console.error(`${symbol.fail()} Config has ${r.issues.length} issue(s):`);
    for (const issue of r.issues) console.error(`  - ${issue}`);
    return 1;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}
