import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { runStatePath } from "../../utils/paths.js";
import { resolveRunRef } from "../run-ref.js";
import {
  readRunAssurance,
  buildAndWriteRunAssurance,
  type RunAssuranceVerdict,
} from "../../safety/run-assurance.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { collectPerItemVerdicts, type PerItemVerdict } from "../../flows/runtime/per-item-verdicts.js";
import { color, symbol } from "../ui/format.js";

const VERDICT_COLOR: Record<RunAssuranceVerdict, (s: string) => string> = {
  verified: color.green,
  partially_verified: color.yellow,
  unverified: color.yellow,
  blocked: color.red,
  unsafe: color.red,
};

/**
 * `vibe assurance <runId>` - show the evidence-backed Run Assurance verdict.
 * Read-only: prints the persisted artifact, deriving it on demand for older
 * runs that predate the artifact.
 */
export function buildAssuranceCommand(): Command {
  const cmd = new Command("assurance");
  cmd
    .description(
      "Show a run's Run Assurance verdict (evidence-backed; from the Action Broker log + review/verification).",
    )
    .argument("<run>", "the run id or display name (see `vibe status`)")
    .option("--json", "emit JSON")
    .action(async (runRef: string, opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const resolved = await resolveRunRef(projectRoot, runRef);
      if (!resolved.ok) {
        console.error(`${symbol.fail()} ${resolved.reason}`);
        process.exit(1);
      }
      const runId = resolved.runId;
      const assurance =
        (await readRunAssurance(projectRoot, runId)) ??
        (await buildAndWriteRunAssurance(projectRoot, runId));

      // Collect per-item verdicts when the run has checklist progress.
      const stateRaw = await readJson<unknown>(runStatePath(projectRoot, runId)).catch(() => null);
      const stateResult = stateRaw ? runStateSchema.safeParse(stateRaw) : null;
      const itemCount = stateResult?.success ? (stateResult.data.checklistProgress?.total ?? 0) : 0;
      const perItemVerdicts: PerItemVerdict[] =
        itemCount > 0
          ? await collectPerItemVerdicts({ projectRoot, runId, itemCount }).catch(() => [])
          : [];

      if (opts.json) {
        console.log(JSON.stringify({ ...assurance, perItemVerdicts }, null, 2));
        return;
      }

      const paint = VERDICT_COLOR[assurance.verdict];
      console.log(
        `${color.bold("Run assurance")} ${color.dim(runId)} - ${paint(
          color.bold(assurance.verdict),
        )}`,
      );
      console.log(color.dim(assurance.summary));
      console.log("");
      if (assurance.blockers.length > 0) {
        for (const b of assurance.blockers) {
          const where = b.stepId ? ` at ${b.stepId}` : "";
          const cls = b.class ? ` [${b.class}]` : "";
          console.log(color.red(`  ✗ cause${where}${cls}: ${b.detail}`));
        }
        console.log("");
      }
      console.log(`  policy:       ${assurance.policy.status}`);
      if (assurance.policy.violations.length > 0) {
        for (const v of assurance.policy.violations) {
          console.log(color.red(`    ✗ ${v.kind}: ${v.reason}`));
        }
      }
      console.log(
        `  validation:   ${assurance.validation.status} (${assurance.validation.passed}/${assurance.validation.total} passed)`,
      );
      console.log(`  review:       ${assurance.review.status}`);
      // Per-item review lane (Shape B / pickup-review runs only).
      if (perItemVerdicts.length > 0) {
        const gapped = perItemVerdicts.filter((v) => v.verdict === "changes_requested");
        const approved = perItemVerdicts.filter((v) => v.verdict === "approved");
        const none = perItemVerdicts.filter((v) => v.verdict === "none");
        console.log(
          `  per-item:     ${perItemVerdicts.length} items - ` +
            `${color.green(String(approved.length))} approved, ` +
            `${gapped.length > 0 ? color.yellow(String(gapped.length)) : "0"} changes requested, ` +
            `${none.length > 0 ? color.dim(String(none.length)) : "0"} no verdict`,
        );
        if (gapped.length > 0) {
          for (const v of gapped) {
            const iters = v.fixIterations > 0 ? ` (${v.fixIterations} fix ${v.fixIterations === 1 ? "iteration" : "iterations"})` : "";
            console.log(color.yellow(`    - item ${v.itemIndex + 1}: changes requested${iters}`));
          }
        }
      }
      console.log(`  verification: ${assurance.verification.status}`);
      if (assurance.coverage.toleratedStepFailures > 0) {
        console.log(
          `  coverage:     ${assurance.coverage.toleratedStepFailures} tolerated step failure(s)`,
        );
      }
      if (assurance.supervisor?.persona) {
        console.log(
          `  supervisor:   ${assurance.supervisor.persona} (${assurance.supervisor.independence})`,
        );
      }
      // Isolation posture - shown only when the run was confined (default "none"
      // is the baseline worktree+diff-gate, not worth a line). Honest counts of
      // what actually ran.
      if (assurance.isolation && assurance.isolation.posture !== "none") {
        const iso = assurance.isolation;
        const parts: string[] = [];
        if (iso.osSandboxedTurns > 0) parts.push(`${iso.osSandboxedTurns} OS-sandboxed`);
        if (iso.hardenedTurns > 0) parts.push(`${iso.hardenedTurns} hardened`);
        if (iso.unconfinedRequestedTurns > 0)
          parts.push(`${iso.unconfinedRequestedTurns} ran unconfined`);
        console.log(
          `  isolation:    ${iso.posture}${parts.length ? ` (${parts.join(", ")})` : ""}`,
        );
      }
      if (assurance.caps.length > 0) {
        console.log("");
        console.log(color.dim(`  caps: ${assurance.caps.join(", ")}`));
      }
      if (assurance.notes.length > 0) {
        if (assurance.caps.length === 0) console.log("");
        console.log(color.dim(`  notes: ${assurance.notes.join(", ")}`));
      }
    });
  return cmd;
}
