// ── Run startup progress (T7) ────────────────────────────────────────────────
//
// Between "run created" and the first agent turn, the orchestrator does real
// setup work - create the git worktree, link the environment, materialize
// context, spawn the provider - which used to happen behind a blank screen. The
// orchestrator now emits a `run.startup` event at each stage boundary; this
// module is the shared, pure derivation both the dashboard and the TUI render as
// a staged checklist (and that surfaces the failed stage instead of a blank run).

export const STARTUP_STAGES = [
  "workspace",
  "environment",
  "context",
  "models",
  "provider",
] as const;
export type StartupStage = (typeof STARTUP_STAGES)[number];

export type StartupStageStatus =
  | "pending"
  | "active"
  | "done"
  | "skipped"
  | "failed";

export const STARTUP_STAGE_LABELS: Record<StartupStage, string> = {
  workspace: "Creating workspace",
  environment: "Linking environment",
  context: "Assembling context",
  models: "Preparing models",
  provider: "Starting provider",
};

export type StartupStageState = {
  stage: StartupStage;
  label: string;
  status: StartupStageStatus;
  detail: string | null;
};

export type StartupProgress = {
  stages: StartupStageState[];
  /** True once the provider stage is reached (the run is now doing real work)
   *  or a stage failed - i.e. the startup checklist can step aside. */
  complete: boolean;
  failedStage: StartupStage | null;
};

function isStage(v: unknown): v is StartupStage {
  return typeof v === "string" && (STARTUP_STAGES as readonly string[]).includes(v);
}

const STATUSES = new Set<StartupStageStatus>([
  "pending",
  "active",
  "done",
  "skipped",
  "failed",
]);

/** Pure: fold the run's `run.startup` events into per-stage status. Returns null
 *  when no startup events exist (an older run, or one that predates the feature),
 *  so callers render nothing rather than an empty checklist. */
export function deriveStartupProgress(
  events: { type: string; data?: Record<string, unknown> }[],
): StartupProgress | null {
  const latest = new Map<
    StartupStage,
    { status: StartupStageStatus; detail: string | null }
  >();
  for (const e of events) {
    if (e.type !== "run.startup") continue;
    const stage = e.data?.stage;
    const status = e.data?.status;
    if (!isStage(stage)) continue;
    if (typeof status !== "string" || !STATUSES.has(status as StartupStageStatus)) {
      continue;
    }
    const detail = typeof e.data?.detail === "string" ? e.data.detail : null;
    latest.set(stage, { status: status as StartupStageStatus, detail });
  }
  if (latest.size === 0) return null;
  const stages: StartupStageState[] = STARTUP_STAGES.map((stage) => {
    const cur = latest.get(stage);
    return {
      stage,
      label: STARTUP_STAGE_LABELS[stage],
      status: cur?.status ?? "pending",
      detail: cur?.detail ?? null,
    };
  });
  const failedStage = stages.find((s) => s.status === "failed")?.stage ?? null;
  const providerState = latest.get("provider")?.status;
  const complete =
    providerState === "active" ||
    providerState === "done" ||
    failedStage !== null;
  return { stages, complete, failedStage };
}
