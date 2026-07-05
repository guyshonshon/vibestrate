import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Diff, GitBranch, Pencil, RotateCcw } from "lucide-react";
import { RunStatusBadge } from "../RunStatusBadge.js";
import { shortRunId } from "../../design/format.js";
import type { RunState, RunStatus } from "../../../lib/types.js";
import { isSpecUpRun } from "../../../lib/run-outcome.js";

/** Inline-editable run display name. Click the pencil to rename; Enter
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
        className="max-w-[320px] rounded-[8px] border border-[color:var(--line-strong)] bg-coal-800 px-1.5 py-0.5 text-[12.5px] text-chalk-100 focus:border-violet-soft/50 focus:outline-none"
      />
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="max-w-[320px] truncate text-[12.5px] font-medium text-chalk-100" title={run.task}>
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
          className="shrink-0 text-chalk-400 hover:text-chalk-100"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.9} />
        </button>
      ) : null}
    </span>
  );
}

const TERMINAL = new Set<RunStatus>([
  "merge_ready",
  "failed",
  "aborted",
  "blocked",
]);

const chromeButton =
  "flex h-8 items-center gap-2 rounded-[10px] border border-[color:var(--line-strong)] bg-coal-600 px-2.5 text-[12px] text-chalk-300 transition hover:bg-coal-500 hover:text-chalk-100 whitespace-nowrap";

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
          className="flex items-center gap-1.5 text-[12.5px] text-chalk-300 transition hover:text-chalk-100 whitespace-nowrap"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.9} />
          Mission
        </button>
        <span className="text-chalk-400">/</span>
        <EditableRunName run={run} onRename={onRename} />
        <span className="mono text-[11px] text-chalk-400 whitespace-nowrap" title={run.runId}>
          {shortRunId(run.runId)}
        </span>
        <span className="text-chalk-400">/</span>
        {specUp ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-violet-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-soft" />
            Spec-up
          </span>
        ) : (
          <RunStatusBadge status={run.status} />
        )}
      </div>
      <div className="flex items-center gap-2">
        {run.branchName ? (
          <button type="button" onClick={onOpenGit} title={run.branchName} className={chromeButton}>
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-chalk-400" strokeWidth={1.9} />
            <span className="mono max-w-[260px] truncate text-[11.5px]">{run.branchName}</span>
          </button>
        ) : null}
        <button type="button" onClick={onOpenDiff} className={chromeButton}>
          <Diff className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} /> View diff
        </button>
        {onRerun && TERMINAL.has(run.status) ? (
          <button
            type="button"
            onClick={onRerun}
            title="Re-run this task with adjusted settings (write access, provider)"
            className="flex h-8 items-center gap-2 rounded-[10px] border border-violet-soft/40 bg-violet-soft/10 px-2.5 text-[12px] text-chalk-100 transition hover:bg-violet-soft/20 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
            Re-run with changes
          </button>
        ) : null}
      </div>
    </header>
  );
}
