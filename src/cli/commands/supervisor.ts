import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import { buildPersonaCatalog } from "../../orchestrator/personas.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import { color, symbol } from "../ui/format.js";

// `vibe supervisor list` - the CLI mirror of the dashboard's Supervisors viewer
// (orchestrator-personas.md). Read-only: lists the resolved persona catalog
// (built-ins + project) and marks the active default. Shares buildPersonaCatalog
// with the dashboard's GET /api/supervisors so the two can't drift.
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

export function buildSupervisorCommand(): Command {
  const cmd = new Command("supervisor").description(
    "Supervisor personas (the orchestrator's judgment posture). See orchestrator-personas.md.",
  );
  const list = async (opts: { json?: boolean }) => {
    process.exit(await runSupervisorList({ json: opts.json }));
  };
  cmd
    .command("list", { isDefault: true })
    .description("List the resolved supervisor personas (built-ins + project).")
    .option("--json", "emit JSON")
    .action(list);
  return cmd;
}
