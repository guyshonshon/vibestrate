import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import {
  setConfigValue,
  installCrewPreset,
  listCrewPresets,
} from "../../setup/config-update-service.js";
import { roleLabel } from "../../crews/crew-registry.js";
import { CREW_PRESETS, type PresetTier } from "../../crews/crew-presets.js";
import type { CrewConfig } from "../../crews/crew-schema.js";
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
  const presets = cmd
    .command("presets")
    .description("Ready-made crews (fast / thorough) tuned by provider effort.");
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
