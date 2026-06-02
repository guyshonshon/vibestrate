import { detectProject } from "../../../project/project-detector.js";
import { configExists } from "../../../project/config-loader.js";
import { color, header, indent, symbol } from "../../ui/format.js";
import { isVibestrateError } from "../../../utils/errors.js";
import {
  refreshCatalog,
  type ProbeFinding,
} from "../../../providers/provider-probe.js";

function describe(f: ProbeFinding): string {
  const knobs: string[] = [];
  if (f.effort) knobs.push(`effort ${f.effort.flag} ${f.effort.levels.join("/")}`);
  if (f.models && f.models.length) knobs.push(`models ${f.models.join(", ")}`);
  const detail = knobs.length ? ` (${knobs.join("; ")})` : f.detail ? ` (${f.detail})` : "";
  switch (f.status) {
    case "added":
      return `${symbol.ok()} ${color.bold(f.providerId)} - added${detail}`;
    case "skipped-overlay":
      return `${symbol.warn()} ${color.bold(f.providerId)} - kept your overlay entry${detail} (use --force to replace)`;
    case "skipped-builtin":
      return `${symbol.warn()} ${color.bold(f.providerId)} - built-in spec kept${detail} (use --force to override)`;
    case "nothing-found":
      return `${color.dim("·")} ${color.bold(f.providerId)} - no machine-readable knobs in --help`;
    case "not-cli":
      return `${color.dim("·")} ${color.bold(f.providerId)} - ${color.dim("not a CLI provider")}${detail}`;
    case "probe-failed":
      return `${symbol.fail()} ${color.bold(f.providerId)} - probe failed${detail}`;
  }
}

export async function runProviderRefresh(
  providerId: string | undefined,
  opts: { force?: boolean; dryRun?: boolean },
): Promise<number> {
  const { projectRoot } = await detectProject(process.cwd());
  if (!(await configExists(projectRoot))) {
    console.error(`${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`);
    return 1;
  }

  let result;
  try {
    result = await refreshCatalog(projectRoot, {
      providerId,
      force: opts.force,
      dryRun: opts.dryRun,
    });
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }

  console.log(header(opts.dryRun ? "Catalog refresh (dry run)" : "Catalog refresh"));
  console.log("");
  for (const f of result.findings) console.log(indent(describe(f)));
  console.log("");
  if (result.wrote) {
    console.log(`${symbol.ok()} Wrote ${color.bold(result.overlayPath)}. ${color.dim("Review it; auto-parsed from --help.")}`);
  } else if (opts.dryRun) {
    console.log(color.dim("Dry run - nothing written."));
  } else {
    console.log(color.dim("No new knobs to add (built-in + your overlay already cover them)."));
  }
  return 0;
}
