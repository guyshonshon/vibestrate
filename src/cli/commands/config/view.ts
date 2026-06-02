import path from "node:path";
import { detectProject } from "../../../project/project-detector.js";
import { showConfig } from "../../../setup/config-update-service.js";
import { configExists } from "../../../project/config-loader.js";
import { projectConfigPath } from "../../../utils/paths.js";
import {
  buildConfigView,
  type ConfigSection,
  type ConfigRow,
} from "../../../setup/config-view.js";
import { color, header, symbol } from "../../ui/format.js";
import { isVibestrateError } from "../../../utils/errors.js";

const VALUE_TONE: Record<NonNullable<ConfigRow["tone"]>, (s: string) => string> = {
  default: (s) => s,
  on: (s) => color.green(s),
  off: (s) => color.gray(s),
  warn: (s) => color.yellow(s),
};

const LABEL_WIDTH = 24;

/** Pad to a column, but always keep at least two spaces so an over-long label
 *  never runs straight into its value. */
function padLabel(label: string): string {
  return label.length < LABEL_WIDTH ? label.padEnd(LABEL_WIDTH) : `${label}  `;
}

function renderRow(row: ConfigRow): string {
  const tone = VALUE_TONE[row.tone ?? "default"];
  const label = color.dim(padLabel(row.label));
  const value = tone(row.value);
  const hint = row.hint ? color.dim(`  (${row.hint})`) : "";
  return `    ${label}${value}${hint}`;
}

function renderSection(section: ConfigSection): string {
  const lines: string[] = [];
  lines.push(`  ${color.bold(section.title)}  ${color.dim(section.summary)}`);
  for (const row of section.rows) lines.push(renderRow(row));
  // Where it's editable - the whole point of the view vs. a raw dump.
  const editParts: string[] = [];
  if (section.editable.surface) {
    const liveTag = section.editable.live ? color.green("live") : color.gray("static");
    editParts.push(`${liveTag} ${section.editable.surface}`);
  }
  for (const cli of section.editable.cli) editParts.push(color.cyan(cli));
  if (editParts.length) {
    lines.push(`    ${color.dim("edit:")} ${editParts.join(color.dim("  ·  "))}`);
  }
  return lines.join("\n");
}

export async function runConfigView(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }
  try {
    const r = await showConfig(detected.projectRoot);
    const configPath = path.relative(
      detected.projectRoot,
      projectConfigPath(detected.projectRoot),
    );

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            configPath,
            valid: r.parsed !== null && r.error === null,
            error: r.error,
            view: r.parsed ? buildConfigView(r.parsed) : null,
          },
          null,
          2,
        ),
      );
      return r.parsed && r.error === null ? 0 : 1;
    }

    if (!r.parsed) {
      console.error(
        `${symbol.fail()} ${color.bold("Config is invalid - cannot render the view.")}`,
      );
      if (r.error) console.error(r.error);
      console.error(
        `\nRun ${color.cyan("vibe config show")} to see the raw YAML, or ${color.cyan("vibe config validate")} for details.`,
      );
      return 1;
    }

    const view = buildConfigView(r.parsed);
    console.log(
      header(`Vibestrate config: ${view.project.name} (${view.project.type})`),
    );
    console.log(color.dim(configPath));
    console.log("");
    console.log(view.sections.map(renderSection).join("\n\n"));

    if (r.error) {
      console.error("");
      console.error(`${symbol.warn()} ${color.bold("Validation issues:")}`);
      console.error(r.error);
      return 1;
    }
    console.log("");
    console.log(
      color.dim(`Raw YAML: ${color.cyan("vibe config show")}`),
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}
