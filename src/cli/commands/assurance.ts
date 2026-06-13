import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { pathExists } from "../../utils/fs.js";
import { runStatePath } from "../../utils/paths.js";
import {
  readRunAssurance,
  buildAndWriteRunAssurance,
  type RunAssuranceVerdict,
} from "../../safety/run-assurance.js";
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
    .argument("<runId>", "the run id (see `vibe status`)")
    .option("--json", "emit JSON")
    .action(async (runId: string, opts: { json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      if (!(await pathExists(runStatePath(projectRoot, runId)))) {
        console.error(`${symbol.fail()} Run ${runId} not found.`);
        process.exit(1);
      }
      const assurance =
        (await readRunAssurance(projectRoot, runId)) ??
        (await buildAndWriteRunAssurance(projectRoot, runId));

      if (opts.json) {
        console.log(JSON.stringify(assurance, null, 2));
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
