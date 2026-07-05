import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { pathExists, readText } from "../../utils/fs.js";
import { runStatePath } from "../../utils/paths.js";
import { runStateSchema } from "../../core/state-machine.js";
import { color, symbol } from "../ui/format.js";

/**
 * `vibe path <runId>` - print a run's workspace: the worktree path, its branch,
 * and a copy-able `cd` line. The companion to the dashboard "Workspace" panel
 * It answers "where is the work / how do I get into that git worktree?".
 *
 * `--cd` prints ONLY the absolute worktree path, for shell use:
 *   cd "$(vibe path <runId> --cd)"
 */
export function buildPathCommand(): Command {
  const cmd = new Command("path");
  cmd
    .description("Show a run's workspace (worktree path + branch) so you can cd into it.")
    .argument("<runId>", "the run id (see `vibe status`)")
    .option("--cd", "print only the absolute worktree path (for `cd \"$(...)\"`)")
    .option("--json", "emit JSON")
    .action(async (runId: string, opts: { cd?: boolean; json?: boolean }) => {
      const { projectRoot } = await detectProject(process.cwd());
      const statePath = runStatePath(projectRoot, runId);
      if (!(await pathExists(statePath))) {
        console.error(`${symbol.fail()} Run ${runId} not found.`);
        process.exit(1);
      }
      const state = runStateSchema.parse(JSON.parse(await readText(statePath)));
      const worktreePath = state.worktreePath;
      const branchName = state.branchName;
      const exists = worktreePath ? await pathExists(worktreePath) : false;

      if (opts.json) {
        console.log(
          JSON.stringify({ runId, worktreePath, branchName, exists }, null, 2),
        );
        return;
      }

      // --cd: machine-friendly single line (or non-zero exit if unusable).
      if (opts.cd) {
        if (!worktreePath || !exists) process.exit(1);
        console.log(worktreePath);
        return;
      }

      if (!worktreePath) {
        console.log(
          `${color.dim("Run")} ${color.bold(runId)} ${color.dim("has no worktree yet.")}`,
        );
        return;
      }
      console.log(`${color.bold("Workspace")} ${color.dim(runId)}`);
      console.log(`  worktree: ${worktreePath}${exists ? "" : color.dim(" (cleaned up)")}`);
      if (branchName) console.log(`  branch:   ${branchName}`);
      if (exists) {
        console.log("");
        console.log(color.dim(`  cd ${shellQuote(worktreePath)}`));
      } else {
        console.log("");
        console.log(
          color.dim(
            "  The worktree was cleaned up; the change is preserved in the run's diff and patch bundle.",
          ),
        );
      }
    });
  return cmd;
}

/** Quote a path for copy-pasting into a POSIX shell (handles spaces). */
function shellQuote(p: string): string {
  return /[^A-Za-z0-9_./-]/.test(p) ? `'${p.replace(/'/g, `'\\''`)}'` : p;
}
