import { detectProject } from "../../../project/project-detector.js";
import { configExists, loadConfig } from "../../../project/config-loader.js";
import { color, header, indent, symbol } from "../../ui/format.js";
import { isVibestrateError } from "../../../utils/errors.js";
import { providerCatalogOverlayPath } from "../../../utils/paths.js";
import { pathExists } from "../../../utils/fs.js";
import {
  PROVIDER_CATALOG,
  providerCapabilities,
  capabilitiesForProvider,
} from "../../../providers/provider-catalog.js";
import {
  loadCatalogOverlay,
  mergeCatalog,
  type CatalogOverlay,
} from "../../../providers/provider-catalog-overlay.js";
import type { ProviderConfig } from "../../../providers/provider-schema.js";

function fmtCaps(models: string[], powerLevels: string[]): string {
  const m = models.length ? models.join(", ") : color.dim("(free-text)");
  const e = powerLevels.length ? powerLevels.join("/") : color.dim("(none)");
  return `models: ${m}   effort: ${e}`;
}

// Where the spec for a configured provider comes from (overlay clears/refines
// per scope+key: cli by id, http by api family).
function sourceOf(
  overlay: CatalogOverlay,
  id: string,
  config: ProviderConfig,
): "overlay" | "built-in" {
  if (config.type === "http-api" || config.type === "localhost-proxy") {
    return overlay.http?.[config.api] ? "overlay" : "built-in";
  }
  const key = config.type === "claude-code" ? "claude" : id;
  return overlay.cli?.[key] ? "overlay" : "built-in";
}

export async function runProviderCatalog(opts: { json?: boolean }): Promise<number> {
  const { projectRoot } = await detectProject(process.cwd());
  const overlayFile = providerCatalogOverlayPath(projectRoot);
  const overlayPresent = await pathExists(overlayFile);

  let overlay: CatalogOverlay;
  try {
    overlay = await loadCatalogOverlay(projectRoot);
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
  const resolved = mergeCatalog(overlay);

  const configured: {
    id: string;
    type: string;
    models: string[];
    powerLevels: string[];
    source: "overlay" | "built-in";
  }[] = [];
  if (await configExists(projectRoot)) {
    const { config } = await loadConfig(projectRoot);
    for (const [id, provider] of Object.entries(config.providers)) {
      const caps = capabilitiesForProvider(id, provider, resolved);
      configured.push({
        id,
        type: provider.type === "localhost-proxy" || provider.type === "http-api"
          ? `${provider.type}:${provider.api}`
          : provider.type,
        models: caps.models,
        powerLevels: caps.powerLevels,
        source: sourceOf(overlay, id, provider),
      });
    }
  }

  const builtin = Object.keys(PROVIDER_CATALOG).map((id) => {
    const caps = providerCapabilities(id, resolved);
    return { id, models: caps.models, powerLevels: caps.powerLevels };
  });

  if (opts.json) {
    console.log(
      JSON.stringify(
        { overlayPath: overlayFile, overlayPresent, configured, builtin },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(header("Provider capability catalog"));
  console.log(
    indent(
      overlayPresent
        ? `${symbol.ok()} overlay: ${color.bold(overlayFile)}`
        : color.dim(`overlay: none (create ${overlayFile} to extend)`),
    ),
  );
  console.log("");

  if (configured.length > 0) {
    console.log(color.bold("Configured in this project:"));
    for (const p of configured) {
      const tag =
        p.source === "overlay" ? color.dim(" [overlay]") : color.dim(" [built-in]");
      console.log(`  ${color.bold(p.id)} ${color.dim(`(${p.type})`)}${tag}`);
      console.log(indent(`  ${fmtCaps(p.models, p.powerLevels)}`));
    }
    console.log("");
  }

  console.log(color.bold("Built-in provider specs:"));
  for (const p of builtin) {
    console.log(`  ${color.bold(p.id)}`);
    console.log(indent(`  ${fmtCaps(p.models, p.powerLevels)}`));
  }
  return 0;
}
