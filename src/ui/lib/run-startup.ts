// UI mirror of src/core/run-startup.ts (T7). The UI build can't import from
// src/core, so this small pure deriver is duplicated here, like the other
// type/logic mirrors in this folder. Keep it in sync with the core version.
import type { VibestrateEvent } from "./types.js";

export const STARTUP_STAGES = [
  "workspace",
  "environment",
  "context",
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
  complete: boolean;
  failedStage: StartupStage | null;
};

const STAGE_SET = new Set<string>(STARTUP_STAGES);
const STATUS_SET = new Set<string>([
  "pending",
  "active",
  "done",
  "skipped",
  "failed",
]);

export function deriveStartupProgress(
  events: VibestrateEvent[],
): StartupProgress | null {
  const latest = new Map<
    StartupStage,
    { status: StartupStageStatus; detail: string | null }
  >();
  for (const e of events) {
    if (e.type !== "run.startup") continue;
    const stage = e.data?.stage;
    const status = e.data?.status;
    if (typeof stage !== "string" || !STAGE_SET.has(stage)) continue;
    if (typeof status !== "string" || !STATUS_SET.has(status)) continue;
    const detail = typeof e.data?.detail === "string" ? e.data.detail : null;
    latest.set(stage as StartupStage, {
      status: status as StartupStageStatus,
      detail,
    });
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
