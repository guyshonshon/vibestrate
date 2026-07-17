import { useEffect, useState } from "react";
import { AlertTriangle, LayoutGrid, Play } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import { Button } from "../design/Button.js";
import type {
  ConflictWarning,
  QueueEntry,
  SchedulerState,
  Task,
} from "../../lib/types.js";

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
    <section className="mt-5 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="font-semibold text-chalk-100">Scheduler</span>
          {state ? (
            <span
              className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${
                state.paused ? "text-amber-soft" : "text-emerald-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  state.paused ? "bg-amber-soft" : "bg-emerald-400"
                }`}
              />
              {state.paused ? "paused" : "active"}
            </span>
          ) : null}
          {idle ? null : (
            <>
              <span className="text-chalk-400">·</span>
              <span className="text-chalk-400">
                {running.length} running · {queue.length} queued
              </span>
            </>
          )}
        </div>
        {state ? (
          <span className="mono whitespace-nowrap text-[11px] text-chalk-400">
            max {state.maxConcurrentRuns} · {state.queuePolicy} · conflict:{" "}
            {state.conflictPolicy}
          </span>
        ) : null}
      </div>

      {idle ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-chalk-400">
            Nothing running or queued. Once the board has work, start the loop
            with <code className="mono text-chalk-300">vibe queue run</code>.
          </p>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.9} />}
            onClick={() => navigate({ kind: "board" })}
          >
            Open the board
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-5">
            <div className="mono mb-2 text-[11px] text-chalk-400">
              Running · {running.length}
            </div>
            {running.length === 0 ? (
              <div className="text-[12px] text-chalk-400">Nothing is running.</div>
            ) : (
              <ul className="space-y-1.5">
                {running.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(id)}
                      className="flex w-full items-center gap-2 rounded-[14px] border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-left text-[12.5px] text-emerald-400 transition hover:bg-emerald-500/15"
                    >
                      <Play className="h-3.5 w-3.5" strokeWidth={1.9} />
                      <span className="flex-1 truncate">{titleFor(id)}</span>
                      <span className="mono text-[11px] text-emerald-400/80">
                        {id.slice(0, 14)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="col-span-12 xl:col-span-7">
            <div className="mono mb-2 text-[11px] text-chalk-400">
              Queued · {queue.length}
            </div>
            {queue.length === 0 ? (
              <div className="text-[12px] text-chalk-400">Queue is empty.</div>
            ) : (
              <ol className="space-y-1.5">
                {queue.map((e) => (
                  <li key={e.taskId}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(e.taskId)}
                      className="flex w-full items-center gap-2 rounded-[14px] border border-[color:var(--line)] bg-coal-500/60 px-3 py-2 text-left text-[12.5px] text-chalk-100 transition hover:bg-coal-500"
                    >
                      <span className={`mono text-[11px] font-medium ${priorityTone(e.priority)}`}>
                        {e.priority}
                      </span>
                      <span className="mono text-[11px] text-chalk-400">{e.source}</span>
                      <span className="flex-1 truncate">{titleFor(e.taskId)}</span>
                      <span className="mono whitespace-nowrap text-[11px] text-chalk-400">
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
        <div className="mt-4 rounded-[14px] border border-amber-soft/25 bg-amber-soft/10 p-3">
          <div className="mono mb-2 flex items-center gap-1.5 text-[11px] text-amber-soft">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.9} />
            Conflict warnings · {conflicts.length}
          </div>
          <ul className="space-y-2">
            {conflicts.slice(-6).map((w) => (
              <li
                key={w.id}
                className="rounded-[14px] border border-[color:var(--line)] bg-coal-500/60 p-2.5 text-[12px] text-chalk-100"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenTask(w.taskId)}
                    className="mono text-chalk-300 hover:text-chalk-100"
                  >
                    {w.taskId}
                  </button>
                  <span className="text-chalk-400">overlaps with</span>
                  {w.conflictsWith.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenTask(id)}
                      className="mono text-chalk-300 hover:text-chalk-100"
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <div className="mono mt-1 text-[11px] text-chalk-400">
                  on {w.overlappingFiles.length} file(s) · policy: {w.policy}{" "}
                  {w.blocked ? (
                    <span className="text-amber-soft">(blocked second task)</span>
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

function priorityTone(p: string): string {
  if (p === "high") return "text-amber-soft";
  if (p === "medium") return "text-violet-soft";
  return "text-chalk-400";
}

