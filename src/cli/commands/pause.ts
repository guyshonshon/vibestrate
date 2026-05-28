import { Command } from "commander";
import { detectProject } from "../../project/project-detector.js";
import {
  PauseError,
  requestPause,
  requestResume,
} from "../../core/pause-service.js";
import { EventLog } from "../../core/event-log.js";
import { RunStateStore } from "../../core/state-machine.js";
import { color } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";

/**
 * `vibe pause <runId>` and `vibe resume <runId>` — write-side toggle on
 * a run's pauseRequested flag. The actively-running orchestrator (if any)
 * picks up the flag at the next stage boundary; if the run is currently
 * idle on disk, the flag is just persisted for the next time the
 * orchestrator processes the run. Either way, no provider call, no shell
 * exec, no worktree write — only state.json + events.ndjson.
 */
export function buildPauseCommand(): Command {
  return new Command("pause")
    .description(
      "Request that an active run pause at the next stage boundary.",
    )
    .argument("<runId>", "id of the run to pause")
    .action(async (runId: string) => {
      process.exit(await runMutation(runId, "pause"));
    });
}

export function buildResumeCommand(): Command {
  return new Command("resume")
    .description(
      "Clear a pending pause request or resume a paused run.",
    )
    .argument("<runId>", "id of the run to resume")
    .action(async (runId: string) => {
      process.exit(await runMutation(runId, "resume"));
    });
}

async function runMutation(
  runId: string,
  kind: "pause" | "resume",
): Promise<number> {
  const detected = await detectProject(process.cwd());
  const store = new RunStateStore(detected.projectRoot, runId);
  if (!(await store.exists())) {
    console.error(color.red(`Run not found: ${runId}`));
    return 1;
  }
  const events = new EventLog(detected.projectRoot, runId);
  try {
    const next =
      kind === "pause"
        ? await requestPause(store, events)
        : await requestResume(store, events);
    if (kind === "pause") {
      console.log(
        `Pause requested for ${runId}. The orchestrator will halt at the next stage boundary (currently at ${next.status}).`,
      );
    } else {
      console.log(
        `Resume requested for ${runId}. The orchestrator will continue from ${next.pausedAtStatus ?? next.status}.`,
      );
    }
    return 0;
  } catch (err) {
    if (err instanceof PauseError) {
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
