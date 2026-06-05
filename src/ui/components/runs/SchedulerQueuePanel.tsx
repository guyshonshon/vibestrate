import { useEffect, useState } from "react";
import { AlertTriangle, Play } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ConflictWarning,
  QueueEntry,
  SchedulerState,
  Task,
} from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { Chip } from "../design/Chip.js";
import { SectionEyebrow } from "../design/SectionEyebrow.js";

/**
 * Scheduler + queue panel: scheduler state, what's running, what's queued, and
 * conflict warnings. Self-loading (polls every 2.5s) so it drops into any page.
 * It used to be the standalone Queue tab; now it lives at the top of Runs so
 * queued and running work sit in one place.
 */
export function SchedulerQueuePanel({
  onOpenTask,
}: {
  onOpenTask: (taskId: string) => void;
}) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [state, setState] = useState<SchedulerState | null>(null);
  const [conflicts, setConflicts] = useState<ConflictWarning[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [q, c, t] = await Promise.all([
          api.getQueue(),
          api.listConflicts(),
          api.listTasks(),
        ]);
        if (cancelled) return;
        setQueue(q.queue);
        setState(q.state);
        setConflicts(c);
        setTasks(t);
      } catch {
        // Transient (server restart / poll race) - keep the last good view.
      }
    };
    void load();
    const interval = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const titleFor = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;
  const running = state?.runningTaskIds ?? [];
  // Quiet by default: when nothing is running or queued and the scheduler is in
  // its resting state, a single compact line keeps Runs uncluttered.
  const idle = running.length === 0 && queue.length === 0;

  return (
    <section className="glass mt-5 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionEyebrow>
          <span className="flex items-center gap-2">
            Scheduler
            {state ? (
              <Chip tone={state.paused ? "amber" : "emerald"}>
                {state.paused ? (
                  "paused"
                ) : (
                  <>
                    <span className="pulse-dot" /> running
                  </>
                )}
              </Chip>
            ) : null}
            <span className="text-fog-500">·</span>
            <span className="text-fog-400">
              {running.length} running · {queue.length} queued
            </span>
          </span>
        </SectionEyebrow>
        {state ? (
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <StateChip label="Max concurrent" value={String(state.maxConcurrentRuns)} />
            <StateChip label="Policy" value={state.queuePolicy} />
            <StateChip label="Conflict" value={state.conflictPolicy} />
          </div>
        ) : null}
      </div>

      {idle ? (
        <div className="mt-3 text-[12px] text-fog-500">
          Nothing running or queued. Add a task from the board, then start the
          loop with <code className="mono text-fog-300">vibe queue run</code>.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-5">
            <div className="eyebrow mb-2">Running · {running.length}</div>
            {running.length === 0 ? (
              <div className="text-[12px] text-fog-500">Nothing is running.</div>
            ) : (
              <ul className="space-y-1.5">
                {running.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(id)}
                      className="w-full rounded-lg border border-emerald-400/30 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.1] px-3 py-2 text-left text-[12.5px] text-emerald-200 flex items-center gap-2"
                    >
                      <Play className="h-3 w-3" strokeWidth={1.7} />
                      <span className="flex-1 truncate">{titleFor(id)}</span>
                      <span className="mono text-[10.5px] text-emerald-300/80">
                        {id.slice(0, 14)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="col-span-12 xl:col-span-7">
            <div className="eyebrow mb-2">Queued · {queue.length}</div>
            {queue.length === 0 ? (
              <div className="text-[12px] text-fog-500">Queue is empty.</div>
            ) : (
              <ol className="space-y-1.5">
                {queue.map((e) => (
                  <li key={e.taskId}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(e.taskId)}
                      className="w-full flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.045] px-3 py-2 text-left text-[12.5px] text-fog-100"
                    >
                      <Chip tone={priorityTone(e.priority)}>{e.priority}</Chip>
                      <Chip tone="neutral">{e.source}</Chip>
                      <span className="flex-1 truncate">{titleFor(e.taskId)}</span>
                      <span className="mono text-[10.5px] text-fog-500 whitespace-nowrap">
                        {new Date(e.enqueuedAt).toLocaleTimeString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {conflicts.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/[0.04] p-3">
          <div className="eyebrow mb-2 text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" strokeWidth={1.7} />
            Conflict warnings · {conflicts.length}
          </div>
          <ul className="space-y-2">
            {conflicts.slice(-6).map((w) => (
              <li
                key={w.id}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[12px] text-fog-100"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onOpenTask(w.taskId)}
                    className="mono text-fog-300 hover:text-fog-100"
                  >
                    {w.taskId}
                  </button>
                  <span className="text-fog-400">overlaps with</span>
                  {w.conflictsWith.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenTask(id)}
                      className="mono text-fog-300 hover:text-fog-100"
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <div className="mt-1 mono text-[10.5px] text-fog-500">
                  on {w.overlappingFiles.length} file(s) · policy: {w.policy}{" "}
                  {w.blocked ? (
                    <span className="text-amber-300">(blocked second task)</span>
                  ) : (
                    "(warned only)"
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function priorityTone(p: string): "violet" | "amber" | "rose" | "neutral" {
  if (p === "high") return "amber";
  if (p === "medium") return "violet";
  return "neutral";
}

function StateChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-1")}>
      <span className="mono text-[9px] uppercase tracking-[0.14em] text-fog-500">
        {label}
      </span>{" "}
      <span className="text-[11.5px] text-fog-100 mono num-tabular">{value}</span>
    </div>
  );
}
