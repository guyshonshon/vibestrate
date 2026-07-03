import { Archive, Ban, Play } from "lucide-react";
import { cn } from "../design/cn.js";
import { Button } from "../design/Button.js";
import { StatTile, type StatTileTone } from "../design/StatTile.js";
import type { Task } from "../../lib/types.js";

// Status → a colour language (same as the Board columns): active/done = emerald,
// fail/blocked = rose, attention = amber, queued = violet, idle = neutral.
function statusTone(s: Task["status"]): StatTileTone {
  switch (s) {
    case "running":
    case "done":
      return "emerald";
    case "failed":
    case "blocked":
      return "rose";
    case "waiting_for_approval":
    case "review":
      return "amber";
    case "queued":
      return "violet";
    default:
      return "default";
  }
}

// Per-tone surfaces so the hero carries the task's state as colour: a left
// spine, a framed status badge, and the progress meter all read the same tone.
const TONE: Record<
  StatTileTone,
  { spine: string; text: string; badge: string; bar: string }
> = {
  default: {
    spine: "bg-chalk-500/40",
    text: "text-chalk-200",
    badge: "border-[color:var(--line-strong)] bg-coal-500/60",
    bar: "bg-chalk-400",
  },
  violet: {
    spine: "bg-violet-soft",
    text: "text-violet-soft",
    badge: "border-violet-soft/30 bg-violet-soft/10",
    bar: "bg-violet-soft",
  },
  emerald: {
    spine: "bg-emerald-400",
    text: "text-emerald-400",
    badge: "border-emerald-400/30 bg-emerald-500/10",
    bar: "bg-emerald-400",
  },
  amber: {
    spine: "bg-amber-soft",
    text: "text-amber-soft",
    badge: "border-amber-soft/30 bg-amber-500/10",
    bar: "bg-amber-400",
  },
  rose: {
    spine: "bg-rose-400",
    text: "text-rose-300",
    badge: "border-rose-400/30 bg-rose-500/10",
    bar: "bg-rose-400",
  },
};

// The one-line "where does this task stand / what's next" headline.
function headlineFor(
  task: Task,
  stepsTotal: number,
  blockers: number,
): { title: string; sub: string } {
  const supervised = task.runMode === "supervised";
  switch (task.status) {
    case "running":
      return { title: "Running now", sub: "An agent is working the task in its worktree." };
    case "queued":
      return { title: "Queued to start", sub: "Waiting for the scheduler to pick it up." };
    case "done":
      return { title: "Done", sub: "The task finished its run." };
    case "failed":
      return { title: "Last run failed", sub: "Review the run, then start again." };
    case "review":
      return { title: "Awaiting review", sub: "A run is ready for your verdict." };
    case "waiting_for_approval":
      return { title: "Waiting for approval", sub: "An action needs your sign-off." };
    case "blocked":
      return { title: "Blocked", sub: "Resolve what this depends on before it can run." };
    case "cancelled":
      return { title: "Cancelled", sub: "Start again to re-run it." };
    default:
      if (blockers > 0)
        return { title: "Blocked by dependencies", sub: `${blockers} task${blockers === 1 ? "" : "s"} must finish first.` };
      if (stepsTotal === 0)
        return {
          title: "Ready to plan",
          sub: supervised
            ? "Let the supervisor break this into steps, then start."
            : "Start the task, or add a checklist first.",
        };
      return {
        title: "Ready to start",
        sub: supervised
          ? "Start to sequence the steps under one worktree."
          : "Start to run the task.",
      };
  }
}

/**
 * The task's top-level control + overview panel. A task is the parent of its
 * runs, so STARTING it is a high-level control that belongs here - not inside the
 * Runs child-list. Composed from the canvas idiom: a contained header with the
 * primary controls, and a row of `lg` StatTiles for the facts.
 */
export function TaskOverviewPanel({
  task,
  stepsDone,
  stepsTotal,
  runsCount,
  busy,
  queueDisabled,
  onStart,
  onCancel,
  onArchive,
}: {
  task: Task;
  stepsDone: number;
  stepsTotal: number;
  runsCount: number;
  busy: string | null;
  queueDisabled: boolean;
  onStart: () => void;
  onCancel: () => void;
  onArchive: () => void;
}) {
  const blockers = task.dependencies?.length ?? 0;
  const tone = statusTone(task.status);
  const t = TONE[tone];
  const { title, sub } = headlineFor(task, stepsTotal, blockers);
  const pct = stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100) : 0;
  const startLabel =
    busy === "queue"
      ? "Starting…"
      : task.status === "running"
        ? "Running"
        : task.status === "queued"
          ? "Queued"
          : "Start task";

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-coal-600 p-5 pl-6">
      {/* Status spine - the task's state carried as colour down the edge. */}
      <span className={cn("absolute inset-y-0 left-0 w-1", t.spine)} aria-hidden />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {/* Prominent, framed status badge (the "add status" element). */}
          <div
            className={cn(
              "flex shrink-0 flex-col justify-center rounded-[14px] border px-3.5 py-2.5",
              t.badge,
            )}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-chalk-400">
              {task.runMode === "supervised" ? "supervised" : "plain"}
            </span>
            <span className={cn("text-[16px] font-bold leading-tight", t.text)}>
              {task.status.replace(/_/g, " ")}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-[-0.01em] text-chalk-100">
              {title}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-chalk-300">{sub}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={onStart}
            disabled={queueDisabled}
            iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={2} />}
          >
            {startLabel}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={busy !== null || task.status === "cancelled"}
            iconLeft={<Ban className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={onArchive}
            disabled={busy !== null}
            iconLeft={<Archive className="h-3.5 w-3.5" strokeWidth={1.9} />}
            title={task.archived ? "Un-archive" : "Archive"}
          >
            {busy === "archive" ? "…" : task.archived ? "Un-archive" : "Archive"}
          </Button>
        </div>
      </div>

      {/* Steps progress meter (only when there are steps). */}
      {stepsTotal > 0 ? (
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between text-[11px]">
            <span className="font-medium text-violet-soft">Steps</span>
            <span className="num-tabular text-chalk-300">
              {stepsDone}/{stepsTotal} done
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-coal-500">
            <span
              className={cn("block h-full rounded-full transition-all", t.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <StatTile size="lg" value={runsCount} label={runsCount === 1 ? "run" : "runs"} />
        <StatTile
          size="lg"
          value={blockers}
          label="blockers"
          tone={blockers > 0 ? "amber" : "default"}
        />
        <StatTile
          size="lg"
          value={task.priority}
          label="priority"
          tone={task.priority === "high" ? "amber" : "default"}
        />
        {task.est ? <StatTile size="lg" value={task.est} label="estimate" /> : null}
      </div>
    </section>
  );
}
