import { readdir } from "node:fs/promises";
import { confirm } from "@inquirer/prompts";
import { detectProject } from "../../project/project-detector.js";
import { configExists } from "../../project/config-loader.js";
import { projectRunsDir } from "../../utils/paths.js";
import {
  planSnapshotPrune,
  executeSnapshotPrune,
  type SnapshotPruneScope,
} from "../../core/run/phase-snapshots.js";
import { color, indent, symbol, isInteractiveTTY } from "../ui/format.js";

export type RunsPruneOptions = {
  keep?: number | null;
  orphans?: boolean;
  run?: string | null;
  dryRun?: boolean;
  yes?: boolean;
};

/**
 * `vibe runs prune` - the CLI half of the dashboard's "Prune snapshots" action.
 * Explicitly deletes rewind-snapshot refs the user chooses to drop: orphans
 * (runs whose dir is gone), beyond a keep-N retention window, or one run. Shows
 * the plan first and only deletes on confirmation (or --yes / --dry-run). The
 * tool still never purges on its own - this is the user pulling the trigger.
 */
export async function runRunsPrune(opts: RunsPruneOptions): Promise<number> {
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }
  if (!detected.isGitRepo) {
    console.error(`${symbol.fail()} Not a git repo - there are no snapshot refs to prune.`);
    return 1;
  }

  // Default scope: orphans (the clearly-uncrucial cleanup) when nothing else is
  // asked for. --keep/--run are additive.
  const scope: SnapshotPruneScope = {
    keep: opts.keep ?? null,
    orphans: opts.orphans ?? (opts.keep == null && !opts.run),
    runId: opts.run ?? null,
  };

  // FAIL CLOSED: read the run dirs with a real readdir. A failed read must abort
  // (never proceed with an empty set, which would mark every ref an orphan).
  let existingRunIds: Set<string>;
  try {
    existingRunIds = new Set(await readdir(projectRunsDir(detected.projectRoot)));
  } catch (err) {
    console.error(
      `${symbol.fail()} Couldn't read the runs directory (${err instanceof Error ? err.message : String(err)}); refusing to prune.`,
    );
    return 1;
  }

  let plan;
  try {
    plan = await planSnapshotPrune(detected.projectRoot, existingRunIds, scope);
  } catch (err) {
    console.error(`${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  if (plan.runs.length === 0) {
    console.log(
      `${symbol.bullet()} Nothing to prune (${plan.totalRunsWithSnapshots} run(s) have snapshots).`,
    );
    if (scope.keep == null && plan.totalRunsWithSnapshots > 1) {
      console.log(
        indent(`Tip: ${color.bold("vibe runs prune --keep <N>")} trims to the N most-recent runs.`),
      );
    }
    return 0;
  }

  const reasons: string[] = [];
  if (plan.orphanRuns.length) reasons.push(`${plan.orphanRuns.length} orphaned (run dir gone)`);
  if (plan.retentionRuns.length) reasons.push(`${plan.retentionRuns.length} beyond --keep ${scope.keep}`);
  if (plan.explicitRuns.length) reasons.push(`run ${plan.explicitRuns[0]}`);
  console.log(
    `${symbol.bullet()} Would prune snapshot refs for ${color.bold(String(plan.runs.length))} run(s): ${reasons.join(", ")}.`,
  );
  for (const runId of plan.runs.slice(0, 50)) {
    console.log(indent(`- ${runId}`));
  }
  if (plan.runs.length > 50) console.log(indent(`… and ${plan.runs.length - 50} more`));

  if (opts.dryRun) {
    console.log(
      indent(color.dim("Dry run - nothing deleted. Re-run without --dry-run to prune.")),
    );
    return 0;
  }

  if (!opts.yes && isInteractiveTTY()) {
    const ok = await confirm({
      message: `Delete snapshot refs for ${plan.runs.length} run(s)? (their artifacts/branches are untouched)`,
      default: false,
    });
    if (!ok) {
      console.log("Cancelled.");
      return 0;
    }
  }

  const pruned = await executeSnapshotPrune(detected.projectRoot, plan.runs);
  console.log(`${symbol.ok()} Pruned snapshot refs for ${color.bold(String(pruned.length))} run(s).`);
  return 0;
}
