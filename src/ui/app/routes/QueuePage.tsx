import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ConflictWarning,
  QueueEntry,
  SchedulerState,
  Task,
} from "../../lib/types.js";

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
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, []);

  if (error)
    return <div className="px-6 py-8 text-amaco-fail">{error}</div>;

  const titleFor = (id: string) =>
    tasks.find((t) => t.id === id)?.title ?? id;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          scheduler
        </div>
        <h1 className="mt-1 text-[16px] font-medium">Queue & concurrency</h1>
        <div className="mt-1 text-[12.5px] text-amaco-fg-dim">
          The scheduler runs queued tasks one at a time by default. Increase{" "}
          <code className="amaco-mono">scheduler.maxConcurrentRuns</code> to opt
          into parallel runs.
        </div>
        {state ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-amaco-fg-dim">
            <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5">
              {state.paused ? "paused" : "running"}
            </span>
            <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5">
              max concurrent: {state.maxConcurrentRuns}
            </span>
            <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5">
              policy: {state.queuePolicy}
            </span>
            <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5">
              conflict: {state.conflictPolicy}
            </span>
          </div>
        ) : null}
        <div className="mt-2 text-[11.5px] text-amaco-fg-muted">
          Start the loop from your terminal:{" "}
          <code className="amaco-mono rounded bg-amaco-panel-2 px-1 py-0.5">
            amaco queue run
          </code>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {state && state.runningTaskIds.length > 0 ? (
          <section className="rounded border border-amaco-border bg-amaco-panel p-3">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              running ({state.runningTaskIds.length})
            </div>
            <ul className="mt-1.5 space-y-1">
              {state.runningTaskIds.map((id) => (
                <li key={id}>
                  <button
                    onClick={() => onOpenTask(id)}
                    className="amaco-mono w-full rounded border border-amaco-accent/40 bg-amaco-accent/10 px-2 py-1 text-left text-[12px] text-amaco-accent hover:bg-amaco-accent/15"
                  >
                    {titleFor(id)} <span className="text-amaco-fg-muted">{id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded border border-amaco-border bg-amaco-panel p-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            queued ({queue.length})
          </div>
          {queue.length === 0 ? (
            <div className="mt-1 text-[12px] text-amaco-fg-muted">
              Queue is empty. Add a task from the board, then run{" "}
              <code className="amaco-mono">amaco queue run</code>.
            </div>
          ) : (
            <ol className="mt-1.5 space-y-1">
              {queue.map((e) => (
                <li key={e.taskId}>
                  <button
                    onClick={() => onOpenTask(e.taskId)}
                    className="flex w-full items-center gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-left text-[12px] text-amaco-fg hover:bg-amaco-panel"
                  >
                    <span className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1 text-[10.5px] text-amaco-fg-muted">
                      {e.priority}
                    </span>
                    <span className="flex-1 truncate">{titleFor(e.taskId)}</span>
                    <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                      enqueued {new Date(e.enqueuedAt).toLocaleTimeString()}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {conflicts.length > 0 ? (
          <section className="rounded border border-amaco-warn/40 bg-amaco-warn/5 p-3">
            <div className="flex items-center gap-1.5">
              <AlertTriangle
                className="h-3.5 w-3.5 text-amaco-warn"
                strokeWidth={1.5}
              />
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-warn">
                conflict warnings ({conflicts.length})
              </div>
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {conflicts.slice(-10).map((w) => (
                <li
                  key={w.id}
                  className="rounded border border-amaco-border bg-amaco-panel-2 p-2 text-[12px] text-amaco-fg"
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenTask(w.taskId)}
                      className="amaco-mono text-amaco-fg-dim hover:text-amaco-fg"
                    >
                      {w.taskId}
                    </button>
                    <span className="text-amaco-fg-muted">overlaps with</span>
                    {w.conflictsWith.map((id) => (
                      <button
                        key={id}
                        onClick={() => onOpenTask(id)}
                        className="amaco-mono text-amaco-fg-dim hover:text-amaco-fg"
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-[11.5px] text-amaco-fg-muted">
                    on {w.overlappingFiles.length} file(s):{" "}
                    {w.overlappingFiles.slice(0, 5).map((f) => (
                      <code
                        key={f}
                        className="amaco-mono mr-1 rounded bg-amaco-panel px-1 py-0.5"
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                  <div className="mt-1 amaco-mono text-[10.5px] text-amaco-fg-muted">
                    policy: {w.policy}{" "}
                    {w.blocked ? (
                      <span className="text-amaco-warn">
                        (blocked second task)
                      </span>
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
    </div>
  );
}
