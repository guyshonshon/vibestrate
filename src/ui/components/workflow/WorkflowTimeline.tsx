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
  "merge_ready",
  "blocked",
  "failed",
  "aborted",
];

function stageState(
  current: RunStatus,
  stageStatuses: RunStatus[],
): "done" | "active" | "pending" {
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
}: {
  status: RunStatus;
  onSelectStage?: (stageId: string) => void;
  selectedStage?: string | null;
}) {
  return (
    <div className="rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        workflow
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-2">
        {STAGES.map((s) => {
          const state = stageState(status, s.statuses);
          const isSelected = selectedStage === s.id;
          const dot =
            state === "done"
              ? "bg-amaco-success"
              : state === "active"
                ? "bg-amaco-accent"
                : "bg-amaco-fg-muted/40";
          const text =
            state === "done"
              ? "text-amaco-fg"
              : state === "active"
                ? "text-amaco-accent"
                : "text-amaco-fg-muted";
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelectStage?.(s.id)}
                className={`group flex w-full flex-col items-start gap-1.5 rounded px-2 py-1.5 text-left hover:bg-amaco-panel-2 ${
                  isSelected ? "bg-amaco-panel-2" : ""
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className={`text-[12px] ${text}`}>{s.label}</span>
                </span>
                <span className="block h-px w-full overflow-hidden">
                  {state === "active" ? (
                    <span className="amaco-pulse-bar block" />
                  ) : (
                    <span
                      className={`block h-px w-full ${
                        state === "done"
                          ? "bg-amaco-success/60"
                          : "bg-amaco-border"
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
