import { detectProject } from "../../project/project-detector.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { RunStateStore } from "../../core/state-machine.js";
import { requestAbort } from "../../core/run/abort-service.js";
import { EventLog } from "../../core/stores/event-log.js";
import { isVibestrateError } from "../../utils/errors.js";

export async function runAbortCommand(runId: string): Promise<number> {
  if (!runId) {
    console.error("vibe abort: missing run id.");
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const stateFile = runStatePath(detected.projectRoot, runId);

  if (!(await pathExists(stateFile))) {
    console.error(`vibe abort: run ${runId} not found.`);
    return 1;
  }

  try {
    const store = new RunStateStore(detected.projectRoot, runId);
    const eventLog = new EventLog(detected.projectRoot, runId);
    const res = await requestAbort(store, eventLog, { reason: "vibe abort" });
    if (res.alreadyTerminal) {
      console.log(`Run ${runId} is already terminal: ${res.run.status}.`);
      return 0;
    }
    // The run stops at its next checkpoint, not the instant this returns. Saying
    // "aborted" here is what made the old direct write feel reliable while it
    // was being silently reverted.
    console.log(
      res.finalized
        ? `Run ${runId} aborted (its process was no longer running).`
        : `Run ${runId}: abort requested. It will stop at its next checkpoint and write its final report.`,
    );
    // Only worth printing once the run is actually over. A run still winding
    // down owns its worktree, and removing it underneath would be the advice
    // that breaks the run rather than cleans up after it.
    if (res.finalized && res.run.worktreePath) {
      console.log("");
      console.log("Manual cleanup:");
      console.log(`  git worktree remove ${res.run.worktreePath}`);
      if (res.run.branchName) console.log(`  git branch -D ${res.run.branchName}`);
    }
    return 0;
  } catch (err) {
    console.error(
      `vibe abort: failed to abort: ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }
}
