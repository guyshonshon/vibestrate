import { detectProject } from "../../../project/project-detector.js";
import { listConfiguredProviders } from "../../../setup/provider-setup-service.js";
import { configExists } from "../../../project/config-loader.js";
import { color, header, indent, symbol } from "../../ui/format.js";
import { isAmacoError } from "../../../utils/errors.js";

export async function runProviderList(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Amaco config found. Run ${color.bold("amaco init")} first.`,
    );
    return 1;
  }

  let providers;
  try {
    providers = await listConfiguredProviders(detected.projectRoot);
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
    );
    return 1;
  }

  if (opts.json) {
    console.log(JSON.stringify(providers, null, 2));
    return 0;
  }

  if (providers.length === 0) {
    console.log(
      `${symbol.warn()} No providers configured yet. Run ${color.bold("amaco provider setup")}.`,
    );
    return 0;
  }

  console.log(header("Configured providers:"));
  console.log("");
  for (const p of providers) {
    const argStr = p.args.length > 0 ? ` ${p.args.join(" ")}` : "";
    console.log(`${color.bold(p.id)}`);
    console.log(indent(`Command: ${p.command}${argStr}`));
    console.log(indent(`Input: ${p.input}`));
    console.log(
      indent(
        `Used by: ${
          p.agentsUsing.length > 0
            ? p.agentsUsing.join(", ")
            : color.dim("(no agents — assign with `amaco provider set " + p.id + "`)")
        }`,
      ),
    );
    console.log("");
  }
  return 0;
}
