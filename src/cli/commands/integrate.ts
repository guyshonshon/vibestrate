import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import {
  listMergeReadyRuns,
  mergePreview,
  integrate,
  IntegrationError,
  type BranchTarget,
  type MergeReadyRun,
} from "../../git/integration-service.js";
import { color, header, indent, isInteractiveTTY, symbol } from "../ui/format.js";
import { startSpinner } from "../ui/spinner.js";
import {
  adviseMergeReadyRuns,
  type MergeAdvice,
} from "../../git/merge-advisor.js";
import {
  analyzeMergeDeeper,
  MergeAnalyzeError,
} from "../../git/merge-analyze.js";

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
      : `${symbol.warn()} Some branches conflict - integrate the clean ones, or resolve conflicts first.`,
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
      console.log(`${symbol.ok()} All selected branches merged. Review ${color.bold(result.integrationBranch)} - main is untouched, nothing was pushed.`);
    }
    return result.stoppedAt ? 1 : 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof IntegrationError ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

function renderAdvice(a: MergeAdvice): void {
  console.log(`${color.bold(a.task)} ${color.dim(`(${a.runId})`)}`);
  console.log(indent(a.headline));
  for (const f of a.flags) {
    const mark = f.severity === "warning" ? symbol.warn() : color.dim("·");
    console.log(indent(`${mark} ${f.summary}`));
    console.log(indent(indent(color.dim(f.detail))));
  }
  console.log(
    indent(
      color.dim(
        `branch ${a.topology.branchName}: ${a.topology.aheadOfMain} ahead / ${a.topology.behindMain} behind; ${a.topology.filesTouched} file(s)`,
      ),
    ),
  );
  console.log(
    indent(
      color.dim(
        a.assurance
          ? `checks: validation ${a.assurance.lanes.validation} · review ${a.assurance.lanes.review} · verification ${a.assurance.lanes.verification} · real check passed: ${a.assurance.anyRealCheckPassed ? "yes" : "no"}`
          : "checks: unknown (no assurance record)",
      ),
    ),
  );
  console.log(
    indent(
      `${color.bold(a.recommendation)} ${color.dim(`- ${a.recommendationReason}`)}`,
    ),
  );
  console.log(indent(color.dim(`shape: ${a.predictedShape}`)));
  if (a.manualSteps) {
    for (const s of a.manualSteps) console.log(indent(color.dim(`step: ${s}`)));
  }
  console.log(indent(color.dim(`advisor persona: ${a.personaId}`)));
}

async function cmdAdvise(
  runIds: string[],
  opts: { json?: boolean },
): Promise<number> {
  const root = await ctx();
  try {
    const { advice, missing } = await adviseMergeReadyRuns({
      projectRoot: root,
      runIds,
    });
    if (opts.json) {
      console.log(JSON.stringify({ advice, missing }, null, 2));
      return missing.length ? 1 : 0;
    }
    for (const m of missing) console.error(`${symbol.warn()} No merge-ready run "${m}".`);
    if (advice.length === 0) {
      console.log("No merge-ready runs to advise on.");
      return missing.length ? 1 : 0;
    }
    console.log(header(`Merge advice (${advice.length} run${advice.length > 1 ? "s" : ""})`));
    console.log(color.dim("Read-only: nothing was merged, no branch was touched."));
    console.log("");
    for (const a of advice) {
      renderAdvice(a);
      console.log("");
    }
    return missing.length ? 1 : 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof IntegrationError ? err.message : err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

async function cmdAnalyze(
  runId: string,
  opts: { json?: boolean },
): Promise<number> {
  const root = await ctx();
  // The deeper analysis is an LLM call (seconds); show feedback so it doesn't
  // look frozen. Stopped before any output, on both paths.
  const spinner = startSpinner("Analyzing");
  try {
    const result = await analyzeMergeDeeper({ projectRoot: root, runId });
    spinner.stop();
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    console.log(result.markdown);
    console.log("");
    console.log(color.dim(`cached: ${result.cachedArtifactPath} · provider: ${result.providerId}`));
    for (const n of result.notes) console.log(color.dim(n));
    return 0;
  } catch (err) {
    spinner.stop();
    console.error(
      `${symbol.fail()} ${err instanceof MergeAnalyzeError ? err.message : err instanceof Error ? err.message : String(err)}`,
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
    .command("advise [runIds...]")
    .description(
      "Read-only merge advice for the selected (or all) merge-ready runs: risk flags, assurance lanes, topology, dry-run conflicts, and a deterministic recommendation. Mutates nothing.",
    )
    .option("--json", "emit the advice as JSON")
    .action(async (runIds: string[], opts: { json?: boolean }) =>
      process.exit(await cmdAdvise(runIds ?? [], opts)),
    );
  cmd
    .command("analyze <runId>")
    .description(
      "Optional read-only LLM pass over the run's redacted diff vs main: semantic risk narrative (never a merge verdict). Spawns a local provider; caches markdown under the run.",
    )
    .option("--json", "emit the full analysis result as JSON")
    .action(async (runId: string, opts: { json?: boolean }) =>
      process.exit(await cmdAnalyze(runId, opts)),
    );
  cmd
    .command("apply [runIds...]")
    .description("Integrate the selected (or all) merge-ready branches into --into <branch>.")
    .requiredOption("--into <branch>", "the integration branch to create (never main)")
    .action(async (runIds: string[], opts) => process.exit(await cmdApply(runIds ?? [], opts)));
  cmd
    .command("finish <integrationBranch>")
    .description(
      "Merge a complete, clean integration branch into main - locally, with explicit confirmation, never pushed. Refuses partial integrations, dirty trees, and conflicts.",
    )
    .option(
      "--confirm <token>",
      'non-interactive consent: must be exactly "merge-to-main"',
    )
    .action(async (branch: string, opts: { confirm?: string }) =>
      process.exit(await cmdFinish(branch, opts)),
    );
  return cmd;
}

async function cmdFinish(
  branch: string,
  opts: { confirm?: string },
): Promise<number> {
  const root = await ctx();
  // Explicit human consent: a typed confirmation interactively, or the exact
  // --confirm token. Nothing else proceeds.
  let consent = opts.confirm === "merge-to-main";
  if (!consent && opts.confirm !== undefined) {
    console.error(`${symbol.fail()} --confirm must be exactly "merge-to-main".`);
    return 2;
  }
  if (!consent && isInteractiveTTY()) {
    const { input } = await import("@inquirer/prompts");
    const typed = await input({
      message: `Merge "${branch}" into main locally (nothing is pushed)? Type merge-to-main to confirm:`,
    });
    consent = typed.trim() === "merge-to-main";
  }
  if (!consent) {
    console.error(
      `${symbol.fail()} Not confirmed. Re-run with --confirm merge-to-main (or type it at the prompt).`,
    );
    return 1;
  }
  try {
    const { finishIntegration } = await import(
      "../../git/integration-service.js"
    );
    const r = await finishIntegration({
      projectRoot: root,
      integrationBranch: branch,
      humanConfirmed: true,
    });
    console.log(
      `${symbol.ok()} Merged ${color.bold(r.integrationBranch)} into ${color.bold(r.intoBranch)} @ ${r.mergedSha.slice(0, 10)}.`,
    );
    console.log(color.dim("Local only - nothing was pushed."));
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
