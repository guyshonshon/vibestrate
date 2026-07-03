import type { ReactNode } from "react";
import { Archive, Ban, Play } from "lucide-react";
import { cn } from "../design/cn.js";
import { Button } from "../design/Button.js";
import { type StatTileTone } from "../design/StatTile.js";
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
const TONE: Record<StatTileTone, { text: string; colBg: string }> = {
  default: { text: "text-chalk-200", colBg: "bg-coal-500/40" },
  violet: { text: "text-violet-soft", colBg: "bg-violet-soft/[0.08]" },
  emerald: { text: "text-emerald-400", colBg: "bg-emerald-500/[0.09]" },
  amber: { text: "text-amber-soft", colBg: "bg-amber-500/[0.09]" },
  rose: { text: "text-rose-300", colBg: "bg-rose-500/[0.09]" },
};

// A checklist step → its segment colour on the progress track. An in-progress
// step IS being worked, so it softly fades (the "processing" cue); while the
// run is live the next-up step is tinted violet.
function segClass(status: string, nextUp: boolean): string {
  if (status === "done") return "bg-emerald-400";
  if (status === "in_progress") return "bg-emerald-400 step-live";
  if (status === "blocked") return "bg-amber-soft";
  if (nextUp) return "bg-violet-soft";
  return "bg-coal-500";
}

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
  const running = task.status === "running";
  const steps = task.checklist ?? [];
  // While a run is live and nothing is explicitly in-progress, tint the first
  // not-done step as "next up".
  const hasInProgress = steps.some((s) => s.status === "in_progress");
  const nextUpIdx =
    running && !hasInProgress ? steps.findIndex((s) => s.status !== "done") : -1;
  const startLabel =
    busy === "queue"
      ? "Starting…"
      : running
        ? "Running"
        : task.status === "queued"
          ? "Queued"
          : "Start task";
  const colSub = running
    ? "live now"
    : task.status === "queued"
      ? "in queue"
      : blockers > 0
        ? "held"
        : null;

  const cell = (value: ReactNode, label: string, valueTone?: string) => (
    <div className="border-r border-[color:var(--line-soft)] px-4 py-3 last:border-r-0">
      <div className={cn("num-tabular text-[16px] font-bold leading-none", valueTone ?? "text-chalk-100")}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium text-violet-soft">{label}</div>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-coal-600">
      <div className="flex">
        {/* Status column - the task's state as a tonal anchor. */}
        <div
          className={cn(
            "flex w-[136px] shrink-0 flex-col justify-center gap-1 border-r border-[color:var(--line)] px-4 py-4",
            t.colBg,
          )}
        >
          <span className="text-[10px] font-medium text-chalk-400">
            {task.runMode === "supervised" ? "Supervised" : "Plain"}
          </span>
          <span className={cn("text-[19px] font-bold leading-[1.05]", t.text)}>
            {task.status.replace(/_/g, " ")}
          </span>
          {colSub ? <span className="text-[11px] text-chalk-400">{colSub}</span> : null}
        </div>

        {/* Main - headline + controls, step track, metric strip. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line-soft)] px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold tracking-[-0.01em] text-chalk-100">
                {title}
              </h2>
              <p className="mt-0.5 text-[12px] text-chalk-300">{sub}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onStart}
                disabled={queueDisabled}
                iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={2} />}
              >
                {startLabel}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onCancel}
                disabled={busy !== null || task.status === "cancelled"}
                iconLeft={<Ban className="h-3.5 w-3.5" strokeWidth={1.9} />}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onArchive}
                disabled={busy !== null}
                iconLeft={<Archive className="h-3.5 w-3.5" strokeWidth={1.9} />}
                title={task.archived ? "Un-archive" : "Archive"}
              >
                {busy === "archive" ? "…" : task.archived ? "Un-archive" : "Archive"}
              </Button>
            </div>
          </div>

          {/* Segmented step track - one segment per step; the live step fades. */}
          {stepsTotal > 0 ? (
            <div className="border-b border-[color:var(--line-soft)] px-5 py-3">
              <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                <span className="font-medium text-violet-soft">Steps</span>
                <span className="num-tabular text-chalk-300">
                  {stepsDone}/{stepsTotal} done · {pct}%
                </span>
              </div>
              <div className="flex gap-1">
                {steps.map((s, i) => (
                  <span
                    key={s.id}
                    className={cn(
                      "h-2 flex-1 rounded-[3px]",
                      segClass(s.status, i === nextUpIdx),
                    )}
                    title={`${i + 1}. ${s.text} - ${s.status.replace(/_/g, " ")}`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Metric strip - facts filling the width, divided not floating. */}
          <div className={cn("grid", task.est ? "grid-cols-4" : "grid-cols-3")}>
            {cell(runsCount, runsCount === 1 ? "run" : "runs")}
            {cell(blockers, "blockers", blockers > 0 ? "text-amber-soft" : undefined)}
            {cell(
              task.priority,
              "priority",
              task.priority === "high" ? "text-amber-soft" : undefined,
            )}
            {task.est ? cell(task.est, "estimate") : null}
          </div>
        </div>
      </div>
    </section>
  );
}
