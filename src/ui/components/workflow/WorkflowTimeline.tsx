import type { RunStatus } from "../../lib/types.js";

const STAGES: { id: string; label: string; statuses: RunStatus[] }[] = [
  { id: "planning", label: "plan", statuses: ["planning", "planned"] },
  {
    id: "architecting",
    label: "architect",
    statuses: ["architecting", "architected"],
  },
  { id: "executing", label: "execute", statuses: ["executing"] },
  { id: "validating", label: "validate", statuses: ["validating"] },
  { id: "reviewing", label: "review", statuses: ["reviewing"] },
  { id: "fixing", label: "fix", statuses: ["fixing"] },
  { id: "verifying", label: "verify", statuses: ["verifying"] },
];

const ORDERED: RunStatus[] = [
  "created",
  "planning",
  "planned",
  "architecting",
  "architected",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "waiting_for_approval",
  "merge_ready",
  "blocked",
  "failed",
  "aborted",
];

function stageState(
  current: RunStatus,
  stageStatuses: RunStatus[],
  pausedAt: RunStatus | null,
): "done" | "active" | "awaiting" | "pending" {
  // If the run is paused for approval, the stage that triggered the pause
  // shows as "awaiting" (cyan, no pulse) instead of "done".
  if (current === "waiting_for_approval" && pausedAt) {
    if (stageStatuses.includes(pausedAt)) return "awaiting";
    const pausedIdx = ORDERED.indexOf(pausedAt);
    const lastStageIdx = Math.max(...stageStatuses.map((s) => ORDERED.indexOf(s)));
    if (pausedIdx > lastStageIdx) return "done";
    return "pending";
  }
  if (stageStatuses.includes(current)) return "active";
  const currentIdx = ORDERED.indexOf(current);
  const lastStageIdx = Math.max(...stageStatuses.map((s) => ORDERED.indexOf(s)));
  if (current === "merge_ready") return "done";
  if (currentIdx > lastStageIdx) return "done";
  return "pending";
}

export function WorkflowTimeline({
  status,
  onSelectStage,
  selectedStage,
  pausedAtStatus = null,
}: {
  status: RunStatus;
  onSelectStage?: (stageId: string) => void;
  selectedStage?: string | null;
  pausedAtStatus?: RunStatus | null;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="text-[12.5px] font-semibold text-chalk-300">Workflow</div>
      <ol className="mt-3 grid grid-cols-7 gap-2">
        {STAGES.map((s) => {
          const state = stageState(status, s.statuses, pausedAtStatus);
          const isSelected = selectedStage === s.id;
          const dot =
            state === "done"
              ? "bg-emerald-400"
              : state === "active"
                ? "bg-violet-soft"
                : state === "awaiting"
                  ? "bg-sky-glow"
                  : "bg-chalk-400/40";
          const text =
            state === "done"
              ? "text-chalk-100"
              : state === "active"
                ? "text-violet-soft"
                : state === "awaiting"
                  ? "text-sky-glow"
                  : "text-chalk-400";
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelectStage?.(s.id)}
                className={`group flex w-full flex-col items-start gap-1.5 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-coal-500 ${
                  isSelected ? "bg-coal-500" : ""
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className={`text-[12px] font-medium ${text}`}>
                    {s.label}
                    {state === "awaiting" ? (
                      <span className="ml-1 text-[10.5px] text-chalk-400">
                        awaiting
                      </span>
                    ) : null}
                  </span>
                </span>
                <span
                  className={`block h-px w-full ${
                    state === "done"
                      ? "bg-emerald-400/60"
                      : state === "active"
                        ? "bg-violet-soft/60"
                        : state === "awaiting"
                          ? "bg-sky-glow/60"
                          : "bg-[color:var(--line)]"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
