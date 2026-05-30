import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import {
  listMergeReadyRuns,
  mergePreview,
  integrate,
  IntegrationError,
  type BranchTarget,
  type MergeReadyRun,
} from "../../integration/integration-service.js";
import { color, header, indent, symbol } from "../ui/format.js";

async function ctx() {
  const detected = await detectProject(process.cwd());
  return detected.projectRoot;
}

/** Resolve the user's run-id selection (or all) to branch targets. */
function selectBranches(
  ready: MergeReadyRun[],
  runIds: string[],
): { targets: BranchTarget[]; missing: string[] } {
  if (runIds.length === 0) {
    return { targets: ready.map((r) => ({ branch: r.branchName, runId: r.runId })), missing: [] };
  }
  const byId = new Map(ready.map((r) => [r.runId, r]));
  const targets: BranchTarget[] = [];
  const missing: string[] = [];
  for (const id of runIds) {
    const r = byId.get(id);
    if (r) targets.push({ branch: r.branchName, runId: r.runId });
    else missing.push(id);
  }
  return { targets, missing };
}

async function cmdList(): Promise<number> {
  const root = await ctx();
  const ready = await listMergeReadyRuns(root);
  if (ready.length === 0) {
    console.log("No merge-ready runs to integrate.");
    return 0;
  }
  console.log(header(`Merge-ready runs (${ready.length})`));
  console.log("");
  for (const r of ready) {
    console.log(`${color.bold(r.task)} ${color.dim(`(${r.runId})`)}`);
    console.log(indent(color.dim(`branch: ${r.branchName}`)));
  }
  return 0;
}

async function cmdPreview(runIds: string[]): Promise<number> {
  const root = await ctx();
  const ready = await listMergeReadyRuns(root);
  const { targets, missing } = selectBranches(ready, runIds);
  for (const m of missing) console.error(`${symbol.warn()} No merge-ready run "${m}".`);
  if (targets.length === 0) {
    console.log("Nothing to preview.");
    return missing.length ? 1 : 0;
  }
  const preview = await mergePreview({ projectRoot: root, branches: targets });
  console.log(header(`Merge preview onto ${preview.baseBranch}`));
  console.log("");
  for (const r of preview.results) {
    if (r.clean) {
      console.log(`${symbol.ok()} ${color.bold(r.branch)} ${color.dim("· clean")}`);
    } else {
      console.log(`${symbol.fail()} ${color.bold(r.branch)} ${color.dim(`· ${r.note}`)}`);
      for (const f of r.conflictedFiles.slice(0, 10)) {
        console.log(indent(color.yellow(`conflict: ${f}`)));
      }
    }
  }
  console.log("");
  console.log(
    preview.allClean
      ? `${symbol.ok()} All clean. Integrate with: ${color.bold("vibe integrate apply --into integration/<name>")}`
      : `${symbol.warn()} Some branches conflict — integrate the clean ones, or resolve conflicts first.`,
  );
  return 0;
}

async function cmdApply(runIds: string[], opts: { into?: string }): Promise<number> {
  if (!opts.into) {
    console.error(`${symbol.fail()} --into <branch> is required (a dedicated integration branch, never main).`);
    return 2;
  }
  const root = await ctx();
  const ready = await listMergeReadyRuns(root);
  const { targets, missing } = selectBranches(ready, runIds);
  for (const m of missing) console.error(`${symbol.warn()} No merge-ready run "${m}".`);
  if (targets.length === 0) {
    console.error(`${symbol.fail()} No branches to integrate.`);
    return 1;
  }
  try {
    const result = await integrate({
      projectRoot: root,
      branches: targets,
      integrationBranch: opts.into,
    });
    console.log(header(`Integrated into ${result.integrationBranch}`));
    console.log(color.dim(`base: ${result.baseBranch} · worktree: ${result.worktreePath}`));
    console.log("");
    for (const r of result.integrated) {
      console.log(
        r.clean
          ? `${symbol.ok()} ${r.branch} ${color.dim("· merged")}`
          : `${symbol.fail()} ${r.branch} ${color.dim(`· ${r.note}`)}`,
      );
    }
    console.log("");
    if (result.stoppedAt) {
      console.log(
        `${symbol.warn()} Stopped at ${color.bold(result.stoppedAt)}. Resolve conflicts in the integration worktree, or re-run without it.`,
      );
    } else {
      console.log(`${symbol.ok()} All selected branches merged. Review ${color.bold(result.integrationBranch)} — main is untouched, nothing was pushed.`);
    }
    return result.stoppedAt ? 1 : 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof IntegrationError ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

export function buildIntegrateCommand(): Command {
  const cmd = new Command("integrate").description(
    "Preview + integrate merge-ready run branches into a dedicated branch (never main, never push).",
  );
  cmd
    .command("list")
    .description("List merge-ready runs (integration candidates).")
    .action(async () => process.exit(await cmdList()));
  cmd
    .command("preview [runIds...]")
    .description("Dry-run merge the selected (or all) merge-ready branches; show conflicts.")
    .action(async (runIds: string[]) => process.exit(await cmdPreview(runIds ?? [])));
  cmd
    .command("apply [runIds...]")
    .description("Integrate the selected (or all) merge-ready branches into --into <branch>.")
    .requiredOption("--into <branch>", "the integration branch to create (never main)")
    .action(async (runIds: string[], opts) => process.exit(await cmdApply(runIds ?? [], opts)));
  return cmd;
}
