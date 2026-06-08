import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { loadConfig } from "../../project/config-loader.js";
import { BUILTIN_PERSONAS } from "../../orchestrator/personas.js";
import { color, symbol } from "../ui/format.js";

// `vibe supervisor list` - the CLI mirror of the dashboard's Supervisor selector
// (orchestrator-personas.md). Read-only: lists the resolved persona catalog
// (built-ins + project) and marks the active default.
export async function runSupervisorList(opts: { json?: boolean }): Promise<number> {
  const cwd = process.cwd();
  const detected = await detectProject(cwd).catch(() => null);
  let defaultPersona = "staff-engineer";
  const merged: Record<
    string,
    { label: string; description?: string; reviewLenses: string[]; builtin: boolean }
  > = {};
  for (const [id, p] of Object.entries(BUILTIN_PERSONAS)) {
    merged[id] = {
      label: p.label,
      description: p.description,
      reviewLenses: p.reviewLenses,
      builtin: true,
    };
  }
  if (detected) {
    try {
      const loaded = await loadConfig(detected.projectRoot);
      defaultPersona = loaded.config.defaultPersona;
      for (const [id, p] of Object.entries(loaded.config.personas ?? {})) {
        merged[id] = {
          label: p.label,
          description: p.description,
          reviewLenses: p.reviewLenses ?? [],
          builtin: false,
        };
      }
    } catch {
      // fall back to built-ins + the staff-engineer default
    }
  }
  const personas = Object.entries(merged).map(([id, p]) => ({ id, ...p }));

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
