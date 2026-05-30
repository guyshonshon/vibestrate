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
 * `vibe assurance <runId>` — show the evidence-backed Run Assurance verdict.
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
        `${color.bold("Run assurance")} ${color.dim(runId)} — ${paint(
          color.bold(assurance.verdict),
        )}`,
      );
      console.log(color.dim(assurance.summary));
      console.log("");
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
      if (assurance.caps.length > 0) {
        console.log("");
        console.log(color.dim(`  caps: ${assurance.caps.join(", ")}`));
      }
    });
  return cmd;
}
