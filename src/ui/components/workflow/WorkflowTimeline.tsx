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
    <div className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        workflow
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-2">
        {STAGES.map((s) => {
          const state = stageState(status, s.statuses, pausedAtStatus);
          const isSelected = selectedStage === s.id;
          const dot =
            state === "done"
              ? "bg-vibestrate-success"
              : state === "active"
                ? "bg-vibestrate-accent"
                : state === "awaiting"
                  ? "bg-vibestrate-accent"
                  : "bg-vibestrate-fg-muted/40";
          const text =
            state === "done"
              ? "text-vibestrate-fg"
              : state === "active" || state === "awaiting"
                ? "text-vibestrate-accent"
                : "text-vibestrate-fg-muted";
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelectStage?.(s.id)}
                className={`group flex w-full flex-col items-start gap-1.5 rounded px-2 py-1.5 text-left hover:bg-vibestrate-panel-2 ${
                  isSelected ? "bg-vibestrate-panel-2" : ""
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className={`text-[12px] ${text}`}>
                    {s.label}
                    {state === "awaiting" ? (
                      <span className="ml-1 text-[10.5px] text-vibestrate-fg-muted">
                        · awaiting
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="block h-px w-full overflow-hidden">
                  {state === "active" ? (
                    <span className="vibestrate-pulse-bar block" />
                  ) : (
                    <span
                      className={`block h-px w-full ${
                        state === "done"
                          ? "bg-vibestrate-success/60"
                          : state === "awaiting"
                            ? "bg-vibestrate-accent/60"
                            : "bg-vibestrate-border"
                      }`}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
