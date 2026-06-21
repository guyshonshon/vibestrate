import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Diff, GitBranch, Pencil, RotateCcw } from "lucide-react";
import { Chip } from "../../design/Chip.js";
import { cn } from "../../design/cn.js";
import { shortRunId } from "../../design/format.js";
import type { RunState, RunStatus } from "../../../lib/types.js";
import { isSpecUpRun } from "../../../lib/run-outcome.js";

/** Inline-editable run display name (T6). Click the pencil to rename; Enter
 *  saves, Escape cancels. Falls back to the task when no name is set. */
function EditableRunName({
  run,
  onRename,
}: {
  run: RunState;
  onRename?: (name: string) => void | Promise<void>;
}) {
  const label = run.displayName || run.task;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== label) void onRename?.(next);
  };
  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            setDraft(label);
            setEditing(false);
          }
        }}
        className="bg-white/[0.06] border border-white/15 rounded px-1.5 py-0.5 text-[12.5px] text-fog-100 max-w-[320px]"
      />
    );
  }
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="text-[12.5px] text-fog-100 font-medium truncate max-w-[320px]" title={run.task}>
        {label}
      </span>
      {onRename ? (
        <button
          type="button"
          onClick={() => {
            setDraft(label);
            setEditing(true);
          }}
          title="Rename this run"
          className="text-fog-500 hover:text-fog-200 shrink-0"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.7} />
        </button>
      ) : null}
    </span>
  );
}

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

const TERMINAL = new Set<RunStatus>([
  "merge_ready",
  "failed",
  "aborted",
  "blocked",
]);

export function RunHeaderV3({
  run,
  onBack,
  onOpenDiff,
  onOpenGit,
  onRerun,
  onRename,
}: {
  run: RunState;
  onBack: () => void;
  onOpenDiff: () => void;
  onOpenGit: () => void;
  onRerun?: () => void;
  onRename?: (name: string) => void | Promise<void>;
}) {
  const specUp = isSpecUpRun(run);
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
        <EditableRunName run={run} onRename={onRename} />
        <span
          className="mono text-[11px] text-fog-500 whitespace-nowrap"
          title={run.runId}
        >
          {shortRunId(run.runId)}
        </span>
        <span className="text-fog-500">/</span>
        <Chip tone={specUp ? "violet" : tone(run.status)}>
          <span className="pulse-dot" /> {specUp ? "Spec-up" : pretty(run.status)}
        </Chip>
      </div>
      <div className="flex items-center gap-2">
        {run.branchName ? (
          <button
            type="button"
            onClick={onOpenGit}
            title={run.branchName}
            className={cn(
              "h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center gap-2 text-[12px] text-fog-200 whitespace-nowrap",
            )}
          >
            <GitBranch className="h-3 w-3 text-fog-400 shrink-0" strokeWidth={1.7} />
            <span className="mono text-[11.5px] max-w-[260px] truncate">
              {run.branchName}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenDiff}
          className="h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center gap-2 text-[12px] text-fog-200 whitespace-nowrap"
        >
          <Diff className="h-3 w-3 text-fog-400" strokeWidth={1.7} /> View diff
        </button>
        {onRerun && TERMINAL.has(run.status) ? (
          <button
            type="button"
            onClick={onRerun}
            title="Re-run this task with adjusted settings (write access, provider)"
            className="h-8 px-2.5 rounded-lg border border-violet-soft/40 bg-violet-soft/10 hover:bg-violet-soft/20 flex items-center gap-2 text-[12px] text-fog-100 whitespace-nowrap"
          >
            <RotateCcw className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
            Re-run with changes
          </button>
        ) : null}
      </div>
    </header>
  );
}
