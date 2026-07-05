import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { renameRun } from "../../core/state-machine.js";
import { color, symbol } from "../ui/format.js";

/**
 * `vibe rename <runId> <name...>` - give a run a friendly display name.
 * The run ID stays the stable identifier; this is just a nicer label for lists
 * and headers. The name is variadic so it works without quotes.
 */
export function buildRenameCommand(): Command {
  const cmd = new Command("rename");
  cmd
    .description("Give a run a friendly display name (the run id stays the same).")
    .argument("<runId>", "the run id (see `vibe status`)")
    .argument("<name...>", "the new display name")
    .action(async (runId: string, nameParts: string[]) => {
      const { projectRoot } = await detectProject(process.cwd());
      const name = nameParts.join(" ");
      try {
        const state = await renameRun(projectRoot, runId, name);
        console.log(
          `${symbol.ok()} Renamed ${color.dim(runId)} to ${color.bold(
            state.displayName ?? name,
          )}`,
        );
      } catch (err) {
        console.error(
          `${symbol.fail()} ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });
  return cmd;
}
