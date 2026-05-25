import { ChevronLeft, Diff, GitBranch } from "lucide-react";
import { Chip } from "../../design/Chip.js";
import { cn } from "../../design/cn.js";
import type { RunState, RunStatus } from "../../../lib/types.js";

function tone(
  status: RunStatus,
): "violet" | "sky" | "amber" | "emerald" | "rose" | "neutral" {
  if (status === "waiting_for_approval" || status === "paused") return "amber";
  if (
    status === "reviewing" ||
    status === "verifying" ||
    status === "validating"
  )
    return "sky";
  if (status === "merge_ready") return "emerald";
  if (status === "failed" || status === "aborted" || status === "blocked")
    return "rose";
  return "violet";
}

function pretty(s: RunStatus): string {
  return (
    ({
      planning: "Planning",
      planned: "Planned",
      architecting: "Architecting",
      architected: "Architected",
      executing: "Executing",
      validating: "Validating",
      reviewing: "Reviewing",
      fixing: "Fixing",
      verifying: "Verifying",
      waiting_for_approval: "Awaiting approval",
      paused: "Paused",
      merge_ready: "Merge ready",
      blocked: "Blocked",
      failed: "Failed",
      aborted: "Aborted",
      created: "Created",
    } as Record<RunStatus, string>)[s] ?? s
  );
}

export function RunHeaderV3({
  run,
  onBack,
  onOpenDiff,
  onOpenGit,
}: {
  run: RunState;
  onBack: () => void;
  onOpenDiff: () => void;
  onOpenGit: () => void;
}) {
  return (
    <header
      className="flex flex-wrap items-center justify-between gap-3"
      data-screen-label="00 Run header"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12.5px] text-fog-300 hover:text-fog-100 whitespace-nowrap"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
          Mission
        </button>
        <span className="text-fog-500">/</span>
        <span className="mono text-[12.5px] text-fog-300 whitespace-nowrap">
          {run.runId}
        </span>
        <span className="text-fog-500">/</span>
        <Chip tone={tone(run.status)}>
          <span className="pulse-dot" /> {pretty(run.status)}
        </Chip>
      </div>
      <div className="flex items-center gap-2">
        {run.branchName ? (
          <button
            type="button"
            onClick={onOpenGit}
            className={cn(
              "h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center gap-2 text-[12px] text-fog-200 whitespace-nowrap",
            )}
          >
            <GitBranch className="h-3 w-3 text-fog-400" strokeWidth={1.7} />
            <span className="mono text-[11.5px]">{run.branchName}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenDiff}
          className="h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center gap-2 text-[12px] text-fog-200 whitespace-nowrap"
        >
          <Diff className="h-3 w-3 text-fog-400" strokeWidth={1.7} /> View diff
        </button>
      </div>
    </header>
  );
}
