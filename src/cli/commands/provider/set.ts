import { detectProject } from "../../../project/project-detector.js";
import {
  listConfiguredProviders,
  setDefaultProvider,
  addProvider,
  buildClaudeProviderFromDetection,
  buildCodexProviderFromDetection,
  buildOllamaProviderFromDetection,
} from "../../../setup/provider-setup-service.js";
import { configExists } from "../../../project/config-loader.js";
import { detectAllProviders } from "../../../providers/provider-detection.js";
import { color, symbol } from "../../ui/format.js";
import { isInteractiveTTY } from "../../ui/format.js";
import { confirm } from "@inquirer/prompts";
import { isAmacoError } from "../../../utils/errors.js";

export async function runProviderSet(
  providerId: string,
  opts: { yes?: boolean },
): Promise<number> {
  if (!providerId) {
    console.error(
      `${symbol.fail()} Provider id is required. Try ${color.bold("amaco provider list")} or ${color.bold("amaco provider detect")}.`,
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

  const providers = await listConfiguredProviders(detected.projectRoot);
  const configured = providers.find((p) => p.id === providerId);

  if (!configured) {
    // If detected on PATH but not configured, offer to add (interactive only).
    const detections = await detectAllProviders();
    const detected1 = detections.find((d) => d.id === providerId && d.available);
    if (
      detected1 &&
      (providerId === "claude" ||
        providerId === "codex" ||
        providerId === "ollama")
    ) {
      // Starter presets get a louder confirmation because flags/model
      // availability may vary. Claude's preset is verified.
      const isStarterPreset = providerId === "codex" || providerId === "ollama";
      const message = isStarterPreset
        ? `Provider "${providerId}" is on PATH but not configured. Add it using Amaco's starter preset? You should follow up with \`amaco provider test ${providerId}\` before relying on it.`
        : `Provider "${providerId}" is on PATH but not in your config yet. Add it now and assign all default agents?`;
      const proceed =
        opts.yes ||
        (isInteractiveTTY() &&
          (await confirm({ message, default: !isStarterPreset })));
      if (proceed) {
        try {
          const config =
            providerId === "codex"
              ? buildCodexProviderFromDetection(detected1)
              : providerId === "ollama"
                ? buildOllamaProviderFromDetection(detected1)
                : buildClaudeProviderFromDetection(detected1);
          await addProvider(detected.projectRoot, {
            id: providerId,
            config,
            alsoAssignAllRoles: true,
          });
          console.log(
            providerId === "codex"
              ? `${symbol.ok()} Added Codex provider with the starter preset. Run \`amaco provider test codex\` to verify the invocation works.`
              : providerId === "ollama"
                ? `${symbol.ok()} Added Ollama provider with the starter preset. Run \`ollama pull qwen3.5\`, then \`amaco provider test ollama\`.`
              : `${symbol.ok()} Added Claude Code provider and assigned all default agents to it.`,
          );
          return 0;
        } catch (err) {
          console.error(
            `${symbol.fail()} ${isAmacoError(err) ? err.message : String(err)}`,
          );
          return 1;
        }
      }
    }
    console.error(
      `${symbol.fail()} Provider ${color.bold(
        providerId,
      )} is not configured.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold(
        "amaco provider setup",
      )} to add a provider.`,
    );
    return 1;
  }

  const result = await setDefaultProvider(detected.projectRoot, providerId);
  if (!result.ok) {
    console.error(`${symbol.fail()} ${result.reason}`);
    console.error(`  ${symbol.arrow()} ${result.hint}`);
    return 1;
  }
  console.log(
    `${symbol.ok()} All default agents now use ${color.bold(providerId)}.`,
  );
  console.log(`  Updated: ${result.rolesUpdated.join(", ")}`);
  return 0;
}
