import { detectProject } from "../../../project/project-detector.js";
import {
  listConfiguredProviders,
  removeProvider,
} from "../../../setup/provider-setup-service.js";
import { configExists } from "../../../project/config-loader.js";
import { color, indent, symbol } from "../../ui/format.js";
import { isInteractiveTTY } from "../../ui/format.js";
import { confirm } from "@inquirer/prompts";
import { isVibestrateError } from "../../../utils/errors.js";

/**
 * `vibe provider remove <id>` — the CLI half of the dashboard's Remove
 * button. Deletes `providers.<id>` from project.yml, refusing if a role
 * still points at it (the user reassigns first). Same guard + messaging as
 * the `DELETE /api/providers/:id` route, so both platforms behave identically.
 */
export async function runProviderRemove(
  providerId: string,
  opts: { yes?: boolean },
): Promise<number> {
  if (!providerId) {
    console.error(
      `${symbol.fail()} Provider id is required. Try ${color.bold("vibe provider list")}.`,
    );
    return 1;
  }

  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }

  let providers;
  try {
    providers = await listConfiguredProviders(detected.projectRoot);
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }

  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    console.error(
      `${symbol.fail()} Provider "${providerId}" is not configured. ${
        providers.length > 0
          ? `Configured: ${providers.map((p) => p.id).join(", ")}.`
          : "None configured."
      }`,
    );
    return 1;
  }

  if (provider.profilesUsing.length > 0) {
    console.error(
      `${symbol.fail()} "${providerId}" is still used by role(s): ${color.bold(
        provider.profilesUsing.join(", "),
      )}.`,
    );
    console.error(
      indent("Point those roles at another provider first, then remove it."),
    );
    return 1;
  }

  if (!opts.yes && isInteractiveTTY()) {
    const ok = await confirm({
      message: `Remove provider "${providerId}" from .vibestrate/project.yml?`,
      default: false,
    });
    if (!ok) {
      console.log("Cancelled.");
      return 0;
    }
  }

  const result = await removeProvider(detected.projectRoot, providerId);
  if (!result.ok) {
    console.error(`${symbol.fail()} ${result.reason}`);
    console.error(indent(result.hint));
    return 1;
  }

  console.log(`${symbol.ok()} Removed provider ${color.bold(providerId)}.`);
  return 0;
}
