import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import { buildPersonaCatalog } from "../../orchestrator/personas.js";
import { listSupervisorArchetypes } from "../../orchestrator/supervisor-archetypes.js";
import {
  adoptArchetype,
  setDefaultPersona,
  removePersona,
} from "../../orchestrator/persona-service.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import { color, symbol } from "../ui/format.js";

// `vibe supervisor` - the CLI mirror of the dashboard's Supervisors surface
// (orchestrator-personas.md). `list`/`archetypes` are read-only; `adopt`/
// `default`/`remove` are the write actions, sharing the SAME persona-service the
// HTTP routes use so the two surfaces can't drift.

/** Resolve the project root or exit with a clear message (write commands need a
 *  real project). */
async function requireProjectRoot(): Promise<string> {
  const detected = await detectProject(process.cwd()).catch(() => null);
  if (!detected) {
    console.error(color.red("No Vibestrate project here. Run `vibe init` first."));
    process.exit(1);
  }
  return detected.projectRoot;
}

export async function runSupervisorList(opts: { json?: boolean }): Promise<number> {
  const cwd = process.cwd();
  const detected = await detectProject(cwd).catch(() => null);
  let config: ProjectConfig | null = null;
  if (detected) {
    try {
      config = (await loadConfig(detected.projectRoot)).config;
    } catch {
      // fall back to built-ins + the staff-engineer default
    }
  }
  const { defaultPersona, personas } = buildPersonaCatalog(config);

  if (opts.json) {
    console.log(JSON.stringify({ defaultPersona, personas }, null, 2));
    return 0;
  }
  console.log(color.bold("Supervisor personas"));
  for (const p of personas) {
    const active = p.id === defaultPersona ? color.cyan(" (default)") : "";
    const origin = p.builtin ? color.dim(" [built-in]") : color.dim(" [project]");
    console.log(`  ${symbol.arrow()} ${color.bold(p.id)}${active}${origin}`);
    if (p.description) console.log(`      ${color.dim(p.description)}`);
    if (p.reviewLenses.length) {
      console.log(`      ${color.dim(`lenses: ${p.reviewLenses.join(", ")}`)}`);
    }
    if (p.prefersPosture) {
      console.log(`      ${color.dim(`posture: prefers ${p.prefersPosture} for risky tasks`)}`);
    }
    if (p.specUpPosture) {
      console.log(`      ${color.dim("spec-up: aims the planning agents (specUpPosture set)")}`);
    }
  }
  return 0;
}

/** `vibe supervisor archetypes` - the adoptable curated catalog (read-only). */
export async function runSupervisorArchetypes(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd()).catch(() => null);
  let adoptedIds = new Set<string>();
  if (detected) {
    try {
      const config = (await loadConfig(detected.projectRoot)).config;
      adoptedIds = new Set(Object.keys(config.personas ?? {}));
    } catch {
      // no config / invalid: nothing is adopted yet
    }
  }
  const archetypes = listSupervisorArchetypes(adoptedIds);
  if (opts.json) {
    console.log(JSON.stringify({ archetypes }, null, 2));
    return 0;
  }
  console.log(color.bold("Supervisor archetypes"));
  for (const a of archetypes) {
    const state = a.adopted ? color.green(" (adopted)") : "";
    console.log(`  ${symbol.arrow()} ${color.bold(a.id)}${state} ${color.dim(a.label)}`);
    if (a.description) console.log(`      ${color.dim(a.description)}`);
    if (a.reviewLenses.length) {
      console.log(`      ${color.dim(`lenses: ${a.reviewLenses.join(", ")}`)}`);
    }
    if (a.prefersFlows.length) {
      console.log(`      ${color.dim(`prefers flow: ${a.prefersFlows.join(", ")}`)}`);
    }
    if (a.prefersPosture) {
      console.log(`      ${color.dim(`posture: ${a.prefersPosture}`)}`);
    }
  }
  console.log(color.dim("\nAdopt one with `vibe supervisor adopt <id>`."));
  return 0;
}

export async function runSupervisorAdopt(archetypeId: string): Promise<number> {
  const projectRoot = await requireProjectRoot();
  try {
    await adoptArchetype(projectRoot, archetypeId);
    console.log(
      `${symbol.ok()} Adopted supervisor ${color.bold(archetypeId)} into personas.`,
    );
    console.log(
      color.dim(`Set it as your default with \`vibe supervisor default ${archetypeId}\`.`),
    );
    return 0;
  } catch (err) {
    console.error(color.red(err instanceof Error ? err.message : String(err)));
    return 1;
  }
}

export async function runSupervisorDefault(id: string): Promise<number> {
  const projectRoot = await requireProjectRoot();
  try {
    await setDefaultPersona(projectRoot, id);
    console.log(
      `${symbol.ok()} ${color.bold(id)} is now the default supervisor.`,
    );
    return 0;
  } catch (err) {
    console.error(color.red(err instanceof Error ? err.message : String(err)));
    return 1;
  }
}

export async function runSupervisorRemove(id: string): Promise<number> {
  const projectRoot = await requireProjectRoot();
  try {
    await removePersona(projectRoot, id);
    console.log(`${symbol.ok()} Removed project supervisor ${color.bold(id)}.`);
    return 0;
  } catch (err) {
    console.error(color.red(err instanceof Error ? err.message : String(err)));
    return 1;
  }
}

export function buildSupervisorCommand(): Command {
  const cmd = new Command("supervisor").description(
    "Supervisor personas (the orchestrator's judgment posture). See orchestrator-personas.md.",
  );

  cmd
    .command("list", { isDefault: true })
    .description("List the resolved supervisor personas (built-ins + project).")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      process.exit(await runSupervisorList({ json: opts.json }));
    });

  cmd
    .command("archetypes")
    .description("List the curated supervisor archetypes you can adopt.")
    .option("--json", "emit JSON")
    .action(async (opts: { json?: boolean }) => {
      process.exit(await runSupervisorArchetypes({ json: opts.json }));
    });

  cmd
    .command("adopt <archetypeId>")
    .description("Adopt a curated archetype into this project's personas.")
    .action(async (archetypeId: string) => {
      process.exit(await runSupervisorAdopt(archetypeId));
    });

  cmd
    .command("default <id>")
    .description("Set the project's default supervisor (built-in or a project persona).")
    .action(async (id: string) => {
      process.exit(await runSupervisorDefault(id));
    });

  cmd
    .command("remove <id>")
    .description("Remove a project persona (not a built-in or the active default).")
    .action(async (id: string) => {
      process.exit(await runSupervisorRemove(id));
    });

  return cmd;
}
