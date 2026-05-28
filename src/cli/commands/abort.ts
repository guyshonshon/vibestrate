import { detectProject } from "../../project/project-detector.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson, writeJson } from "../../utils/json.js";
import {
  applyTransition,
  isTerminal,
  runStateSchema,
} from "../../core/state-machine.js";
import { EventLog } from "../../core/event-log.js";
import { isVibestrateError } from "../../utils/errors.js";

export async function runAbortCommand(runId: string): Promise<number> {
  if (!runId) {
    console.error("vibestrate abort: missing run id.");
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const stateFile = runStatePath(detected.projectRoot, runId);

  if (!(await pathExists(stateFile))) {
    console.error(`vibestrate abort: run ${runId} not found.`);
    return 1;
  }

  const raw = await readJson<unknown>(stateFile);
  const parsed = runStateSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`vibestrate abort: state.json for ${runId} is invalid.`);
    return 1;
  }
  const state = parsed.data;

  if (isTerminal(state.status)) {
    console.log(`Run ${runId} is already terminal: ${state.status}.`);
    return 0;
  }

  try {
    const next = applyTransition(state, "aborted");
    await writeJson(stateFile, next);
    const eventLog = new EventLog(detected.projectRoot, runId);
    await eventLog.append({
      type: "run.aborted",
      message: `Run ${runId} aborted by user.`,
    });
  } catch (err) {
    console.error(
      `vibestrate abort: failed to abort: ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    return 1;
  }

  console.log(`Run ${runId} marked as aborted.`);
  if (state.worktreePath) {
    console.log("");
    console.log("Manual cleanup:");
    console.log(`  git worktree remove ${state.worktreePath}`);
    if (state.branchName) console.log(`  git branch -D ${state.branchName}`);
  }
  return 0;
}
