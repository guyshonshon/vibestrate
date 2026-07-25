import { useEffect, useRef, useState } from "react";
import { Diff, GitBranch, Pencil, RotateCcw } from "lucide-react";
import { HeroCard, type HeroTone } from "../../design/HeroCard.js";
import { Button } from "../../design/Button.js";
import { IconBtn } from "../../design/IconBtn.js";
import { Breadcrumbs } from "../../layout/Breadcrumbs.js";
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
        className="max-w-[320px] rounded-[8px] border border-[color:var(--line-strong)] bg-coal-800 px-1.5 py-0.5 text-[13.5px] font-bold text-chalk-100 focus:border-violet-soft/50 focus:outline-none"
      />
    );
  }
  return (
    // No explicit size/weight here - it inherits HeroCard's h3 title
    // treatment (bold, text-chalk-100) since this renders inside that slot.
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="max-w-[320px] truncate" title={run.task}>
        {label}
      </span>
      {onRename ? (
        <IconBtn
          variant="plain"
          title="Rename this run"
          onClick={() => {
            setDraft(label);
            setEditing(true);
          }}
        >
          <Pencil className="h-3 w-3" strokeWidth={1.9} />
        </IconBtn>
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

// Mirrors RunStatusBadge's status grouping (kept local since that mapping
// isn't exported): HeroCard's tonal column stands in for the status chip on
// this card, so the two must agree on which runs read as live / attention /
// done.
const HERO_TONE: Record<RunStatus, HeroTone> = {
  created: "default",
  planning: "violet",
  planned: "violet",
  architecting: "violet",
  architected: "violet",
  executing: "violet",
  validating: "sky",
  reviewing: "sky",
  verifying: "sky",
  fixing: "amber",
  waiting_for_approval: "amber",
  paused: "amber",
  blocked: "amber",
  merge_ready: "emerald",
  failed: "rose",
  aborted: "default",
};

/**
 * The run page's top chrome: breadcrumb trail, editable name, and the run's
 * chrome actions.
 *
 * Deliberately NOT a HeroCard. `RunStatusSection` directly below is the page's
 * hero and already carries the run's title, tonal status and metrics; making
 * this one a hero too printed both twice, stacked. One hero per page - this is
 * the trail above it that answers "where am I".
 */
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
      <div className="flex min-w-0 items-center gap-3">
        <Breadcrumbs
          items={[
            { label: "Mission", onClick: onBack },
            {
              label: <span title={run.runId}>{shortRunId(run.runId)}</span>,
              muted: true,
            },
          ]}
        />
        <EditableRunName run={run} onRename={onRename} />
      </div>
      <div className="flex items-center gap-2">
        <>
          {run.branchName ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenGit}
                title={run.branchName}
                iconLeft={
                  <GitBranch className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />
                }
              >
                <span className="mono max-w-[260px] truncate">{run.branchName}</span>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenDiff}
              iconLeft={<Diff className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              View diff
            </Button>
            {onRerun && TERMINAL.has(run.status) ? (
              // Intent-tinted ghost (primitives-contract §4/RunActions.tsx) -
              // Button has no violet-intent variant, so this stays a bare
              // button carrying the tint directly.
              <button
                type="button"
                onClick={onRerun}
                title="Re-run this task with adjusted settings (write access, provider)"
                className="flex h-7 items-center gap-1.5 rounded-[10px] border border-violet-soft/40 bg-violet-soft/10 px-2.5 text-[12px] font-semibold text-chalk-100 transition hover:bg-violet-soft/20 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
                Re-run with changes
              </button>
            ) : null}
        </>
      </div>
    </header>
  );
}
