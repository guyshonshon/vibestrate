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
  // Structured-probe delta (codex debug models): show what changed vs before.
  const delta =
    (f.added && f.added.length) || (f.removed && f.removed.length)
      ? "\n" +
        indent(
          [
            f.added && f.added.length ? color.green(`+ ${f.added.join(", ")}`) : "",
            f.removed && f.removed.length ? color.yellow(`- ${f.removed.join(", ")}`) : "",
          ]
            .filter(Boolean)
            .join("  "),
        )
      : "";
  const src = f.source ? ` ${color.dim(`via ${f.source}`)}` : "";
  switch (f.status) {
    case "added":
      return `${symbol.ok()} ${color.bold(f.providerId)} - updated${detail}${src}${delta}`;
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
    // Structured probes (codex) write the detected cache; --help findings write
    // the overlay. Report whichever happened so the message is accurate.
    const structured = result.findings.some((f) => f.status === "added" && f.source);
    const heuristic = result.findings.some((f) => f.status === "added" && !f.source);
    const where = structured && heuristic
      ? "the detected cache + your catalog overlay"
      : structured
        ? "the detected models cache"
        : color.bold(result.overlayPath);
    console.log(`${symbol.ok()} Updated ${where}. ${color.dim("Detected models now drive the model/effort pickers (run-start auto-detect keeps them fresh).")}`);
  } else if (opts.dryRun) {
    console.log(color.dim("Dry run - nothing written."));
  } else {
    console.log(color.dim("No new knobs to add (built-in + your overlay already cover them)."));
  }
  return 0;
}
