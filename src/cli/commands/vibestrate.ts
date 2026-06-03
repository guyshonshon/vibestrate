import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import {
  loadProjectManual,
  writeProjectManual,
  STARTER_MANUAL,
} from "../../project/project-manual.js";
import {
  listManualProposals,
  getManualProposal,
  applyManualProposal,
  rejectManualProposal,
} from "../../project/manual-proposals.js";
import { color, header, indent, symbol } from "../ui/format.js";

export function buildVibestrateCommand(): Command {
  const cmd = new Command("vibestrate").description(
    "Manage VIBESTRATE.md (the orchestrator's operating manual) and its proposals.",
  );

  cmd
    .command("show")
    .description("Print the project's VIBESTRATE.md (or note that there is none).")
    .action(async () => {
      const { projectRoot } = await detectProject(process.cwd());
      const manual = await loadProjectManual(projectRoot);
      if (!manual.present || !manual.content) {
        console.log(color.dim("No VIBESTRATE.md yet. Create one: vibe vibestrate init"));
        return;
      }
      console.log(manual.content);
    });

  cmd
    .command("init")
    .description("Scaffold a starter VIBESTRATE.md at the project root (refuses if one exists).")
    .action(async () => {
      const { projectRoot } = await detectProject(process.cwd());
      const manual = await loadProjectManual(projectRoot);
      if (manual.present) {
        console.error(`${symbol.fail()} VIBESTRATE.md already exists at ${manual.path}.`);
        process.exit(1);
      }
      try {
        const { path } = await writeProjectManual(projectRoot, STARTER_MANUAL, { reason: "init" });
        console.log(`${symbol.ok()} Created ${color.bold(path)}. Edit it, then commit it.`);
      } catch (err) {
        console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  const proposals = cmd
    .command("proposals")
    .description("List open VIBESTRATE.md proposals (e.g. from consult).")
    .option("--all", "include applied/rejected proposals")
    .action(async (opts: { all?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const list = await listManualProposals(
        projectRoot,
        opts.all ? undefined : { status: "open" },
      );
      if (list.length === 0) {
        console.log(color.dim("No proposals."));
        return;
      }
      console.log(header(`Manual proposals (${list.length})`));
      for (const p of list) {
        console.log("");
        console.log(`${color.bold(p.id)} ${color.dim(`[${p.status}]`)}`);
        console.log(indent(color.dim(p.rationale)));
      }
    });

  proposals
    .command("show <id>")
    .description("Show a proposal's full suggested text.")
    .action(async (id: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      const p = await getManualProposal(projectRoot, id);
      if (!p) {
        console.error(`${symbol.fail()} No proposal "${id}".`);
        process.exit(1);
      }
      console.log(header(`${p.id} [${p.status}]`));
      console.log(color.dim(`why: ${p.rationale}`));
      if (p.evidence) console.log(color.dim(`evidence: ${p.evidence}`));
      console.log("");
      console.log(p.suggestedText.trim());
    });

  cmd
    .command("apply <id>")
    .description("Apply a proposal - append its text to VIBESTRATE.md (guarded write).")
    .action(async (id: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        const { created } = await applyManualProposal(projectRoot, id);
        console.log(
          `${symbol.ok()} Applied ${color.bold(id)} - ${created ? "created" : "updated"} VIBESTRATE.md. Review the diff before committing.`,
        );
      } catch (err) {
        console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  cmd
    .command("reject <id>")
    .description("Reject a proposal (keeps it on record, marked rejected).")
    .action(async (id: string) => {
      const { projectRoot } = await detectProject(process.cwd());
      try {
        await rejectManualProposal(projectRoot, id);
        console.log(`${symbol.ok()} Rejected ${color.bold(id)}.`);
      } catch (err) {
        console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return cmd;
}
