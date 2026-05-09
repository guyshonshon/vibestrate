import path from "node:path";
import { detectProject } from "../../project/project-detector.js";
import { readJson } from "../../utils/json.js";
import { readDirSafe, pathExists } from "../../utils/fs.js";
import {
  projectRunsDir,
  runDir,
  runStatePath,
} from "../../utils/paths.js";
import type { RunState } from "../../core/state-machine.js";
import { runStateSchema } from "../../core/state-machine.js";

type StatusOptions = {
  json?: boolean;
};

export async function runStatusCommand(opts: StatusOptions): Promise<number> {
  const cwd = process.cwd();
  const detected = await detectProject(cwd);

  const runsDir = projectRunsDir(detected.projectRoot);
  const runIds = (await readDirSafe(runsDir)).sort();

  const states: RunState[] = [];
  for (const id of runIds) {
    const stateFile = runStatePath(detected.projectRoot, id);
    if (!(await pathExists(stateFile))) continue;
    try {
      const raw = await readJson<unknown>(stateFile);
      const parsed = runStateSchema.safeParse(raw);
      if (parsed.success) states.push(parsed.data);
    } catch {
      // Skip unreadable runs.
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(states, null, 2));
    return 0;
  }

  if (states.length === 0) {
    console.log("No Amaco runs found.");
    return 0;
  }

  console.log(
    "RUN ID                                                   STATUS         REVIEW              VERIFICATION   TASK",
  );
  for (const s of states) {
    const review = s.finalDecision ?? "-";
    const verification = s.verification ?? "-";
    const task = s.task.length > 60 ? `${s.task.slice(0, 57)}...` : s.task;
    console.log(
      `${s.runId.padEnd(56)} ${s.status.padEnd(14)} ${review.padEnd(19)} ${verification.padEnd(14)} ${task}`,
    );
  }

  console.log("");
  console.log(`Runs dir: ${path.relative(cwd, runsDir) || runsDir}`);
  for (const s of states.slice(-3)) {
    const dir = path.relative(cwd, runDir(detected.projectRoot, s.runId));
    console.log(`  ${s.runId} → ${dir}`);
  }

  return 0;
}
