// ── Workspace coordinator (Multi-project slices c-board + d) ─────────────────
//
// Cross-project *write* actions — launch a run, abort a run — and the read it
// takes to make abort usable (active runs per project). Every action is built
// on the SAME per-root core primitives a single-project run uses:
//   • launch → the audited detached `dist/run-entry.js` (cwd pinned to target)
//   • abort  → the target root's own state-machine transition + event log
// so the run still loads that project's config, policies, and Action Broker.
//
// (b) decision, made concrete here: we do NOT build one HTTP server that serves
// N project roots (which would mean re-guarding every read/write by root).
// Instead the dashboard stays single-served and these few cross-root operations
// funnel through one coordinator + one safety gate (`resolveTargetProject`),
// with an append-only dispatch audit log. Local-first; nothing hosted.

import { z } from "zod";
import { appendLine, pathExists } from "../utils/fs.js";
import { readJson, writeJson } from "../utils/json.js";
import { nowIso } from "../utils/time.js";
import {
  projectRunsDir,
  runStatePath,
} from "../utils/paths.js";
import { readDirSafe } from "../utils/fs.js";
import {
  applyTransition,
  isTerminal,
  runStateSchema,
} from "../core/state-machine.js";
import { EventLog } from "../core/event-log.js";
import { startDetachedRun } from "../core/detached-run.js";
import type { RunSpec } from "../core/run-launcher.js";
import { formatArgv } from "../scheduler/rerun-args.js";
import { defaultWorkspaceDispatchLog } from "./workspace-store.js";
import {
  resolveTargetProject,
  WorkspaceSafetyError,
  type WorkspaceSafetyDeps,
} from "./workspace-safety.js";

/** Constrained launch request — the cross-project analogue of `POST /api/runs`
 *  bodies. Narrow on purpose: no arbitrary argv ever crosses a root. */
export const workspaceRunRequestSchema = z.object({
  /** Registry label or absolute path of the target project. */
  project: z.string().min(1).max(1024),
  task: z.string().min(1).max(2000),
  taskId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
    .nullable()
    .optional(),
  effort: z.enum(["low", "medium", "high"]).nullable().optional(),
  crewId: z.string().min(1).max(128).nullable().optional(),
  profileOverride: z.string().min(1).max(128).nullable().optional(),
  readOnly: z.boolean().optional(),
  checklistMode: z.enum(["continuous", "step"]).nullable().optional(),
  skills: z
    .array(z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/))
    .max(64)
    .optional(),
  flow: z
    .object({
      id: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[a-z][a-z0-9-]*$/),
      brief: z.string().max(4000).nullable().optional(),
      contextPolicy: z.enum(["balanced", "compact", "artifact-heavy"]).optional(),
    })
    .strict()
    .nullable()
    .optional(),
});
export type WorkspaceRunRequest = z.infer<typeof workspaceRunRequestSchema>;

export type DispatchAction = "launch" | "abort" | "enqueue" | "drain-launch";

/** Append a single line to the cross-project dispatch audit log. Best-effort:
 *  a logging failure must never block or undo the action it records. */
export async function appendDispatch(entry: {
  action: DispatchAction;
  root: string;
  label: string;
  detail: Record<string, unknown>;
  spawnedBy: string;
}): Promise<void> {
  try {
    await appendLine(
      defaultWorkspaceDispatchLog(),
      JSON.stringify({ at: nowIso(), ...entry }),
    );
  } catch {
    // audit is best-effort; the action itself is the source of truth
  }
}

function specFromRequest(root: string, req: WorkspaceRunRequest): RunSpec {
  return {
    projectRoot: root,
    task: req.task,
    taskId: req.taskId ?? null,
    effort: req.effort ?? null,
    crewId: req.crewId ?? null,
    profileOverride: req.profileOverride ?? null,
    seatRoleOverrides: {},
    readOnly: req.readOnly ?? false,
    checklistMode: req.checklistMode ?? null,
    runtimeSkills: req.skills ?? [],
    concise: false,
    flow: req.flow ?? null,
    resumeFrom: null,
  };
}

/** Reconstruct the equivalent `vibe` command (for transparency in responses). */
function equivalentArgv(req: WorkspaceRunRequest): string[] {
  const argv: string[] = ["run", req.task];
  if (req.taskId) argv.push("--task", req.taskId);
  if (req.effort) argv.push("--effort", req.effort);
  if (req.crewId) argv.push("--crew", req.crewId);
  if (req.profileOverride) argv.push("--profile", req.profileOverride);
  if (req.readOnly) argv.push("--read-only");
  if (req.checklistMode) argv.push("--checklist", req.checklistMode);
  if (req.skills?.length) argv.push("--skills", req.skills.join(","));
  if (req.flow) argv.push("--flow", req.flow.id);
  return argv;
}

export type LaunchResult = {
  ok: true;
  root: string;
  label: string;
  pid: number | null;
  argv: string[];
  message: string;
};

/**
 * Launch a run in a registered project. Gated by `resolveTargetProject`; the
 * run executes through the audited detached core entry with cwd pinned to the
 * (vetted) target root.
 */
export async function launchRunInProject(
  req: WorkspaceRunRequest,
  deps: WorkspaceSafetyDeps & { spawnedBy?: string },
): Promise<LaunchResult> {
  const target = await resolveTargetProject(req.project, deps);
  const spec = specFromRequest(target.root, req);
  const spawnedBy = deps.spawnedBy ?? "workspace";
  const pid = await startDetachedRun({ spec, spawnedBy });
  const argv = equivalentArgv(req);
  await appendDispatch({
    action: "launch",
    root: target.root,
    label: target.label,
    detail: { task: req.task, taskId: req.taskId ?? null, flow: req.flow?.id ?? null, pid },
    spawnedBy,
  });
  return {
    ok: true,
    root: target.root,
    label: target.label,
    pid,
    argv,
    message: `started run in ${target.label} (equivalent: vibe ${formatArgv(argv)})`,
  };
}

export type AbortResult = {
  ok: true;
  root: string;
  label: string;
  runId: string;
  alreadyTerminal: boolean;
  status: string;
};

/** Abort a run in a registered project via that root's own state machine. */
export async function abortRunInProject(
  input: { project: string; runId: string },
  deps: WorkspaceSafetyDeps & { spawnedBy?: string },
): Promise<AbortResult> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}$/.test(input.runId)) {
    throw new WorkspaceSafetyError("Invalid run id.");
  }
  const target = await resolveTargetProject(input.project, deps);
  const stateFile = runStatePath(target.root, input.runId);
  if (!(await pathExists(stateFile))) {
    throw new WorkspaceSafetyError(
      `Run ${input.runId} not found in ${target.label}.`,
      404,
    );
  }
  const parsed = runStateSchema.safeParse(await readJson<unknown>(stateFile));
  if (!parsed.success) {
    throw new WorkspaceSafetyError("Run state on disk is unreadable.", 500);
  }
  const state = parsed.data;
  if (isTerminal(state.status)) {
    return {
      ok: true,
      root: target.root,
      label: target.label,
      runId: input.runId,
      alreadyTerminal: true,
      status: state.status,
    };
  }
  const next = applyTransition(state, "aborted");
  await writeJson(stateFile, next);
  await new EventLog(target.root, input.runId).append({
    type: "run.aborted",
    message: `Run ${input.runId} aborted via workspace.`,
  });
  await appendDispatch({
    action: "abort",
    root: target.root,
    label: target.label,
    detail: { runId: input.runId },
    spawnedBy: deps.spawnedBy ?? "workspace",
  });
  return {
    ok: true,
    root: target.root,
    label: target.label,
    runId: input.runId,
    alreadyTerminal: false,
    status: next.status,
  };
}

export type ActiveRunRef = {
  runId: string;
  task: string;
  status: string;
  startedAt: string;
};

/**
 * Non-terminal runs in a project (cap-bounded). Read-only and bounded to
 * `<root>/.vibestrate/runs`; used by the abort UI and the queue drainer's
 * per-project capacity check. Pure read.
 */
export async function listActiveRunsInProject(root: string): Promise<ActiveRunRef[]> {
  const ids = (await readDirSafe(projectRunsDir(root))).sort();
  const active: ActiveRunRef[] = [];
  for (const id of ids) {
    const stateFile = runStatePath(root, id);
    if (!(await pathExists(stateFile))) continue;
    try {
      const parsed = runStateSchema.safeParse(await readJson<unknown>(stateFile));
      if (!parsed.success) continue;
      const s = parsed.data;
      if (isTerminal(s.status)) continue;
      active.push({ runId: s.runId, task: s.task, status: s.status, startedAt: s.startedAt });
    } catch {
      // skip unreadable run
    }
  }
  return active;
}
