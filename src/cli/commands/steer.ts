import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import { GuidanceError, queueGuidance } from "../../core/run/guidance-service.js";
import { RunStateStore } from "../../core/state-machine.js";
import { color } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";
import { resolveRunRefOrReport } from "../../core/run/run-ref.js";

/**
 * `vibe steer <runId> "<note>"` - queue a human note onto a live run.
 *
 * Same write-side shape as `vibe pause`: this only appends to the run's
 * `pendingGuidance`; the running orchestrator drains it at the next STEP
 * boundary and injects it into that step's prompt through the same seam an
 * approval's change-request uses. No provider call, no shell exec, no worktree
 * write - only state.json.
 *
 * Landing at a boundary rather than instantly is deliberate: a code-writing
 * seat holds an open worktree, and cutting into it between two writes leaves
 * half-written files behind. The cost is at most one step of latency.
 */
export function buildSteerCommand(): Command {
  return new Command("steer")
    .description(
      "Queue a note onto a running run; it is applied at the next step boundary.",
    )
    .argument("<runId>", "id of the run to steer (a unique prefix is enough)")
    .argument("<note...>", "what the agents should do differently")
    .option(
      "--step <stepId>",
      "hold the note until this specific step runs (default: whichever step runs next)",
    )
    .action(async (ref: string, note: string[], opts: { step?: string }) => {
      const { projectRoot: pr } = await detectProject(process.cwd());
      const runId = await resolveRunRefOrReport(pr, ref);
      if (runId === null) process.exit(1);
      process.exit(await run(runId, note.join(" "), opts.step ?? null));
    });
}

async function run(
  runId: string,
  note: string,
  stepId: string | null,
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const store = new RunStateStore(detected.projectRoot, runId);
  if (!(await store.exists())) {
    console.error(color.red(`Run not found: ${runId}`));
    return 1;
  }
  try {
    const res = await queueGuidance(store, note, { stepId });
    const where = stepId ? `step "${stepId}"` : "the next step";
    console.log(`Guidance queued for ${runId} (${res.queued} waiting), applied at ${where}.`);
    if (!res.live) {
      // Never imply it landed. A run with no owning process has nobody left to
      // drain the queue until it is resumed.
      console.log(
        color.yellow(
          "  No orchestrator process owns this run right now, so nothing will read it until the run is running again.",
        ),
      );
    }
    return 0;
  } catch (err) {
    if (err instanceof GuidanceError) {
      console.error(color.yellow(err.message));
      return 2;
    }
    if (isVibestrateError(err)) {
      console.error(color.red(err.message));
      return 2;
    }
    throw err;
  }
}
