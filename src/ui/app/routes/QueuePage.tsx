import { useEffect, useState } from "react";
import { AlertTriangle, Play } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ConflictWarning,
  QueueEntry,
  SchedulerState,
  Task,
} from "../../lib/types.js";
import { cn } from "../../components/design/cn.js";
import { Chip } from "../../components/design/Chip.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";

/**
 * Scheduler queue page. Lives separately from Mission's Workspace
 * card because this is the *control* surface: scheduler state, the
 * actual queue, conflict warnings, and the verbatim CLI hint.
 */
export function QueuePage({
  onOpenTask,
}: {
  onOpenTask: (taskId: string) => void;
}) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [state, setState] = useState<SchedulerState | null>(null);
  const [conflicts, setConflicts] = useState<ConflictWarning[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [q, c, t] = await Promise.all([
        api.getQueue(),
        api.listConflicts(),
        api.listTasks(),
      ]);
      setQueue(q.queue);
      setState(q.state);
      setConflicts(c);
      setTasks(t);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 2500);
    return () => window.clearInterval(interval);
  }, []);

  const titleFor = (id: string) =>
    tasks.find((t) => t.id === id)?.title ?? id;

  return (
    <div className="relative z-10 mx-auto max-w-[1280px] px-6 pt-5 pb-12">
      {/* Compact header */}
      <section className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="eyebrow">Scheduler</span>
          <span className="text-fog-500">·</span>
          <h1 className="text-[15px] font-semibold tracking-tight text-fog-100">
            Queue & concurrency
          </h1>
          {state ? (
            <Chip tone={state.paused ? "amber" : "emerald"}>
              {state.paused ? "paused" : (
                <>
                  <span className="pulse-dot" /> running
                </>
              )}
            </Chip>
          ) : null}
        </div>
        <div className="text-[11.5px] text-fog-500 mono">
          Start the loop:{" "}
          <code className="bg-white/[0.04] rounded px-1 py-0.5 text-fog-200">
            amaco queue run
          </code>
        </div>
      </section>

      <p className="text-[12.5px] text-fog-400 mt-2 max-w-[760px]">
        The scheduler runs queued tasks one at a time by default. Increase{" "}
        <code className="mono text-fog-200">scheduler.maxConcurrentRuns</code>{" "}
        to opt into parallel runs.
      </p>

      {state ? (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <StateChip label="Max concurrent" value={String(state.maxConcurrentRuns)} />
          <StateChip label="Policy" value={state.queuePolicy} />
          <StateChip label="Conflict" value={state.conflictPolicy} />
          <StateChip
            label="Default/source"
            value={
              typeof state.defaultSourceConcurrency === "number"
                ? String(state.defaultSourceConcurrency)
                : "—"
            }
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="mt-6 grid grid-cols-12 gap-5">
        {/* Running */}
        <div className="col-span-12 xl:col-span-5 glass p-4">
          <SectionEyebrow className="mb-3">
            <span>
              Running ·{" "}
              {state ? state.runningTaskIds.length : 0}
            </span>
          </SectionEyebrow>
          {!state || state.runningTaskIds.length === 0 ? (
            <div className="text-[12px] text-fog-500">Nothing is running.</div>
          ) : (
            <ul className="space-y-1.5">
              {state.runningTaskIds.map((id) => (
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

        {/* Queued */}
        <div className="col-span-12 xl:col-span-7 glass p-4">
          <SectionEyebrow className="mb-3">
            <span>Queued · {queue.length}</span>
          </SectionEyebrow>
          {queue.length === 0 ? (
            <div className="text-[12px] text-fog-500">
              Queue is empty. Add a task from the board, then run{" "}
              <code className="mono text-fog-300">amaco queue run</code>.
            </div>
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
      </section>

      {conflicts.length > 0 ? (
        <section className="mt-5 glass border-amber-400/30 p-4">
          <SectionEyebrow className="mb-3">
            <span className="text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" strokeWidth={1.7} />
              Conflict warnings · {conflicts.length}
            </span>
          </SectionEyebrow>
          <ul className="space-y-2">
            {conflicts.slice(-10).map((w) => (
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
                <div className="mt-1 text-[11.5px] text-fog-400">
                  on {w.overlappingFiles.length} file(s):{" "}
                  {w.overlappingFiles.slice(0, 5).map((f) => (
                    <code
                      key={f}
                      className="mono mr-1 rounded bg-white/[0.04] px-1 py-0.5 text-fog-300"
                    >
                      {f}
                    </code>
                  ))}
                </div>
                <div className="mt-1 mono text-[10.5px] text-fog-500">
                  policy: {w.policy}{" "}
                  {w.blocked ? (
                    <span className="text-amber-300">(blocked second task)</span>
                  ) : (
                    "(warned only)"
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function priorityTone(p: string): "violet" | "amber" | "rose" | "neutral" {
  if (p === "high") return "amber";
  if (p === "medium") return "violet";
  if (p === "low") return "neutral";
  return "neutral";
}

function StateChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("rounded-md border border-white/[0.07] bg-white/[0.02] px-3 py-1.5")}>
      <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-fog-500">
        {label}
      </div>
      <div className="text-[12.5px] text-fog-100 mono num-tabular truncate">
        {value}
      </div>
    </div>
  );
}
