import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import {
  setConfigValue,
  installCrewPreset,
  listCrewPresets,
} from "../../setup/config-update-service.js";
import { roleLabel } from "../../agents/crew-registry.js";
import { CREW_PRESETS, type PresetTier } from "../../agents/crew-presets.js";
import type { CrewConfig } from "../../agents/crew-schema.js";
import {
  draftCrewFromDescription,
  type DraftedRoleFile,
} from "../../agents/crew-assist.js";
// One currency renderer for both drafting surfaces, mirroring the single
// `currencySchema` the two assist services share - "what I checked / what I
// could not" must read identically wherever a draft is shown.
import { printCurrency } from "./flows/draft.js";
import { color, header, indent, symbol } from "../ui/format.js";

type CrewRole = CrewConfig["roles"][string];

async function ctx() {
  return (await detectProject(process.cwd())).projectRoot;
}

/** One-line role summary: label, the seats it fills, its profile + permissions. */
function roleLine(roleId: string, role: CrewRole): string {
  const seats = role.seats.length ? role.seats.join(", ") : color.dim("(no seats)");
  return `${color.bold(roleLabel(roleId, role))} ${color.dim(`· ${role.permissions}`)} → ${color.dim("profile")} ${role.profile} ${color.dim(`· seats: ${seats}`)}`;
}

async function cmdList(opts: { json?: boolean }): Promise<number> {
  const root = await ctx();
  const { config } = await loadConfig(root);
  const ids = Object.keys(config.crews);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          defaultCrew: config.defaultCrew,
          crews: ids.map((id) => ({
            id,
            label: config.crews[id]!.label ?? id,
            isDefault: id === config.defaultCrew,
            roles: Object.keys(config.crews[id]!.roles),
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (ids.length === 0) {
    console.log("No crews configured.");
    return 0;
  }
  console.log(header(`Crews (${ids.length})`));
  console.log("");
  for (const id of ids) {
    const c = config.crews[id]!;
    const def = id === config.defaultCrew ? ` ${color.cyan("· default")}` : "";
    console.log(`${color.bold(c.label ?? id)} ${color.dim(`(${id})`)}${def}`);
    console.log(indent(color.dim(`${Object.keys(c.roles).length} role(s)`)));
  }
  console.log("");
  console.log(color.dim("Switch with: ") + color.bold("vibe crew use <id>"));
  return 0;
}

async function cmdShow(id: string | undefined, opts: { json?: boolean }): Promise<number> {
  const root = await ctx();
  const { config } = await loadConfig(root);
  const crewId = id ?? config.defaultCrew;
  const crew = config.crews[crewId];
  if (!crew) {
    console.error(`${symbol.fail()} No crew "${crewId}".`);
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify({ id: crewId, isDefault: crewId === config.defaultCrew, ...crew }, null, 2));
    return 0;
  }
  console.log(
    header(`${crew.label ?? crewId}${crewId === config.defaultCrew ? " (default)" : ""}`),
  );
  console.log("");
  for (const [roleId, role] of Object.entries(crew.roles)) {
    console.log(indent(roleLine(roleId, role)));
  }
  return 0;
}

async function cmdUse(id: string): Promise<number> {
  const root = await ctx();
  const { config } = await loadConfig(root);
  if (!config.crews[id]) {
    console.error(
      `${symbol.fail()} No crew "${id}". ${color.dim("See `vibe crew list`.")}`,
    );
    return 1;
  }
  if (config.defaultCrew === id) {
    console.log(`${symbol.ok()} ${color.bold(id)} is already the default crew.`);
    return 0;
  }
  try {
    await setConfigValue(root, "defaultCrew", id);
  } catch (err) {
    console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  console.log(
    `${symbol.ok()} Default crew set to ${color.bold(id)} - runs without --crew use it.`,
  );
  return 0;
}

async function cmdPresets(opts: { json?: boolean }): Promise<number> {
  const root = await ctx();
  const rows = await listCrewPresets(root);
  if (opts.json) {
    console.log(JSON.stringify({ presets: rows }, null, 2));
    return 0;
  }
  console.log(header("Crew presets"));
  console.log("");
  for (const r of rows) {
    const status = r.installed
      ? color.cyan("· installed")
      : r.available
        ? color.dim("· available")
        : color.dim("· n/a here");
    console.log(`${color.bold(r.label)} ${color.dim(`(${r.id})`)} ${status}`);
    console.log(indent(color.dim(r.description)));
    if (!r.installed && r.available && r.effect) {
      const bits = [
        r.effect.power ? `${r.effect.power} effort` : null,
        r.effect.model ? `model ${r.effect.model}` : null,
        r.effect.maxReviewLoops !== null
          ? `${r.effect.maxReviewLoops} review loop${r.effect.maxReviewLoops === 1 ? "" : "s"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      console.log(indent(color.dim(`-> ${r.effect.provider}${bits ? ` · ${bits}` : ""}`)));
    } else if (!r.available && r.reason) {
      console.log(indent(color.dim(`(not here: ${r.reason})`)));
    }
  }
  console.log("");
  console.log(
    color.dim("Add with ") +
      color.bold("vibe crew presets add <id>") +
      color.dim(", then ") +
      color.bold("vibe crew use <id>") +
      color.dim("."),
  );
  return 0;
}

async function cmdPresetAdd(id: string): Promise<number> {
  const root = await ctx();
  const known = CREW_PRESETS.map((p) => p.id);
  if (!known.includes(id as PresetTier)) {
    console.error(
      `${symbol.fail()} Unknown preset "${id}". ${color.dim(`Available: ${known.join(", ")}.`)}`,
    );
    return 1;
  }
  try {
    const res = await installCrewPreset(root, id as PresetTier);
    const bits = [
      res.power ? `${res.power} effort` : null,
      res.model ? `model ${res.model}` : null,
      res.maxReviewLoops !== null
        ? `${res.maxReviewLoops} review loop${res.maxReviewLoops === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(
      `${symbol.ok()} Installed crew ${color.bold(res.crewId)} on profile ${color.bold(res.profileId)} ${color.dim(`(${res.ref}${bits ? ` · ${bits}` : ""})`)}.`,
    );
    console.log(
      color.dim("Use it with ") +
        color.bold(`vibe crew use ${res.crewId}`) +
        color.dim(", or one-off ") +
        color.bold(`vibe run "…" --crew ${res.crewId}`) +
        color.dim("."),
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

/**
 * Turn an English description into an editable Crew draft.
 *
 * DRAFT ONLY - this command writes nothing, and no installer exists yet, so the
 * owner installs BOTH artifacts by hand: one JSON role file per role, then the
 * `crews.<id>` block under `crews:` in .vibestrate/project.yml. Printing only
 * the block would hand the owner a crew whose roles point at files nobody
 * wrote, which fails the moment a run loads the config - so every role file is
 * printed in full, and the install order is stated.
 *
 * `problems` are the checks the crew schema cannot make (profile ids,
 * permission ids, role files, one role per seat); they are shown, not thrown,
 * so the whole roster stays reviewable.
 */
async function cmdDraft(
  description: string,
  opts: { yaml?: boolean; json?: boolean },
): Promise<number> {
  const root = await ctx();
  const { draft } = await draftCrewFromDescription({ projectRoot: root, description });

  if (opts.json) {
    console.log(JSON.stringify({ draft }, null, 2));
    return 0;
  }

  if (opts.yaml) {
    // Only the block on stdout so it pipes cleanly. Everything the piped block
    // is not - the role files it points at, the problems, the currency report -
    // goes to stderr, where a redirect cannot hide it.
    const err = (line: string) => process.stderr.write(`${line}\n`);
    process.stdout.write(draft.yaml.endsWith("\n") ? draft.yaml : `${draft.yaml}\n`);
    printRoleFiles(draft.roleFiles, err);
    printProblems(draft.problems, err);
    printCurrency(draft.currency, err);
    err(
      `\n${color.dim("Nothing was written, and the piped block is half a crew: save each role file above first, then the block belongs under ")}${color.bold("crews:")}${color.dim(" in .vibestrate/project.yml.")}`,
    );
    return 0;
  }

  console.log(header(`Draft crew: ${draft.crew.label ?? draft.crewId}`));
  console.log(indent(color.dim(`id: ${draft.crewId}`)));
  if (draft.exists) {
    console.log(
      indent(color.yellow(`a crew "${draft.crewId}" already exists - rename it or replace it`)),
    );
  }
  console.log("");
  for (const [roleId, role] of Object.entries(draft.crew.roles)) {
    console.log(indent(roleLine(roleId, role)));
  }

  printRoleFiles(draft.roleFiles);

  console.log("");
  console.log(
    color.bold("The crew block") + color.dim(" - under crews: in .vibestrate/project.yml"),
  );
  console.log(indent(draft.yaml.trimEnd()));

  console.log("");
  console.log(color.bold("Rationale"));
  console.log(indent(draft.rationale));

  // Problems and currency print last, above the hint: the YAML block is long
  // enough to scroll them off the top if they came first.
  printProblems(draft.problems);
  printCurrency(draft.currency);

  console.log("");
  console.log(
    color.dim("Nothing was written. In order: save each role file above, add the block under ") +
      color.bold("crews:") +
      color.dim(" in .vibestrate/project.yml, then ") +
      color.bold(`vibe crew use ${draft.crewId}`) +
      color.dim("."),
  );
  return 0;
}

/**
 * The half of the draft that is not the config block: one JSON role file per
 * role, path and full contents, ready to save. A crew block installed without
 * these points every role at a file that is not there. There is no preflight
 * over the crew's roles, so the failure lands on the FIRST TURN that needs the
 * missing file (`loadRolePrompt`, from `runRoleTurn`) - every earlier role has
 * already run and billed by then. That is why this prints in every non-JSON
 * mode, including `--yaml`.
 */
export function printRoleFiles(
  files: DraftedRoleFile[],
  write: (line: string) => void = console.log,
): void {
  write("");
  write(
    color.bold(`The role files (${files.length})`) +
      color.dim(" - save each one at the path shown, before the crew block"),
  );
  for (const file of files) {
    write("");
    write(indent(color.cyan(file.path)));
    write(indent(file.json.trimEnd()));
  }
}

/** What stands between the draft and a crew that runs - what is wrong, and what
 *  is still to write. Prints always, so an empty list is a real terminus. */
function printProblems(
  problems: string[],
  write: (line: string) => void = console.log,
): void {
  write("");
  write(color.bold("Before this crew can run"));
  if (problems.length === 0) {
    write(indent(color.dim("(nothing outstanding)")));
    return;
  }
  for (const problem of problems) {
    write(indent(`${symbol.warn()} ${problem}`));
  }
}

export function buildCrewCommand(): Command {
  const cmd = new Command("crew").description(
    'List crews, show a crew\'s roles, and set the default ("active") crew.',
  );
  cmd
    .command("list")
    .description("List configured crews (the default is marked).")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => process.exit(await cmdList(opts)));
  cmd
    .command("show [id]")
    .description("Show a crew's roles, profiles, and seats (default crew if omitted).")
    .option("--json", "emit JSON")
    .action(async (id: string | undefined, opts: { json?: boolean }) =>
      process.exit(await cmdShow(id, opts)),
    );
  cmd
    .command("use <id>")
    .description("Set the default (\"active\") crew - runs without --crew use it.")
    .action(async (id: string) => process.exit(await cmdUse(id)));
  // Supervisor-assisted authoring, parity with `vibe flows draft` and the
  // dashboard's draft panel. It hits the model and NEVER writes.
  cmd
    .command("draft <description>")
    .description(
      "Turn an English description into an editable Crew draft (supervisor-assisted). Draft only - never writes; adopting it means saving the printed role files, then the block, into project.yml.",
    )
    .option("--yaml", "print only the crews block, for piping into a file")
    .option("--json", "emit JSON")
    .action(async (description: string, opts: { yaml?: boolean; json?: boolean }) =>
      process.exit(await cmdDraft(description, opts)),
    );
  const presets = cmd
    .command("presets")
    .description("Ready-made crews (fast / thorough / cheap / local) tuned by provider effort.");
  presets
    .command("list", { isDefault: true })
    .description("List available presets and whether they're installed.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => process.exit(await cmdPresets(opts)));
  presets
    .command("add <id>")
    .description("Install a preset crew (fast / thorough) into project.yml.")
    .action(async (id: string) => process.exit(await cmdPresetAdd(id)));
  return cmd;
}
