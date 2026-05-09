import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { api } from "../../lib/api.js";
import type { MicroStep, Task, TaskComment } from "../../lib/types.js";
import { MicroStepPipeline } from "../../components/board/MicroStepPipeline.js";

export function TaskDetailPage({
  taskId,
  onOpenRun,
}: {
  taskId: string;
  onOpenRun: (runId: string) => void;
}) {
  const [data, setData] = useState<{
    task: Task;
    comments: TaskComment[];
    microSteps: { runId: string; steps: MicroStep[] }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");

  async function load() {
    try {
      const r = await api.getTask(taskId);
      setData(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [taskId]);

  async function queue() {
    setBusy("queue");
    try {
      await api.queueTask(taskId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      await api.cancelTask(taskId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setBusy("comment");
    try {
      await api.addTaskComment({ taskId, body: newComment.trim() });
      setNewComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function resolveComment(commentId: string) {
    setBusy(commentId);
    try {
      await api.resolveTaskComment({ taskId, commentId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (error)
    return <div className="px-6 py-8 text-amaco-fail">{error}</div>;
  if (!data)
    return <div className="px-6 py-8 text-amaco-fg-muted">Loading task…</div>;

  const { task, comments, microSteps } = data;
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          task · {task.id}
        </div>
        <h1 className="mt-1 text-[16px] font-medium">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-amaco-fg-dim">
          <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
            {task.status}
          </span>
          <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
            priority: {task.priority}
          </span>
          <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
            risk: {task.riskLevel}
          </span>
          {task.roadmapItemId ? (
            <span className="amaco-mono text-amaco-fg-muted">
              roadmap: {task.roadmapItemId}
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={queue}
            disabled={
              busy !== null ||
              task.status === "queued" ||
              task.status === "running"
            }
            className="rounded border border-amaco-accent/40 bg-amaco-accent/10 px-2.5 py-1 text-[12px] text-amaco-accent hover:bg-amaco-accent/20 disabled:opacity-50"
          >
            {busy === "queue" ? "Queueing…" : "Queue task"}
          </button>
          <button
            onClick={cancel}
            disabled={busy !== null || task.status === "cancelled"}
            className="rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-1 text-[12px] text-amaco-fg-dim hover:bg-amaco-panel disabled:opacity-50"
          >
            Cancel
          </button>
          <span className="ml-auto text-[10.5px] text-amaco-fg-muted">
            Run from CLI:{" "}
            <code className="amaco-mono rounded bg-amaco-panel-2 px-1 py-0.5">
              amaco tasks run {task.id}
            </code>
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {task.description ? (
          <section className="rounded border border-amaco-border bg-amaco-panel p-3">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              description
            </div>
            <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-amaco-fg">
              {task.description}
            </div>
          </section>
        ) : null}

        <section className="rounded border border-amaco-border bg-amaco-panel p-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            runs
          </div>
          {task.runIds.length === 0 ? (
            <div className="mt-1 text-[12px] text-amaco-fg-muted">No runs yet.</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {task.runIds.map((rid) => (
                <li key={rid}>
                  <button
                    onClick={() => onOpenRun(rid)}
                    className="amaco-mono inline-flex items-center gap-1.5 text-[12px] text-amaco-fg-dim hover:text-amaco-fg"
                  >
                    <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                    {rid}
                    {rid === task.currentRunId ? (
                      <span className="amaco-mono ml-1 rounded border border-amaco-accent/50 px-1 text-[10px] text-amaco-accent">
                        current
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {microSteps.map(({ runId, steps }) => (
          <MicroStepPipeline key={runId} runId={runId} steps={steps} />
        ))}

        <section className="rounded border border-amaco-border bg-amaco-panel p-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            comments
          </div>
          <form onSubmit={submitComment} className="mt-2 flex gap-2">
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment (saved to .amaco/roadmap/comments/<task>.json)"
              className="flex-1 resize-y rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5 text-[12.5px] text-amaco-fg placeholder-amaco-fg-muted"
            />
            <button
              type="submit"
              disabled={busy === "comment" || !newComment.trim()}
              className="self-start rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-1 text-[12px] text-amaco-fg hover:bg-amaco-panel disabled:opacity-50"
            >
              {busy === "comment" ? "Saving…" : "Add"}
            </button>
          </form>
          {open.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
                open ({open.length})
              </div>
              {open.map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-amaco-border bg-amaco-panel-2 p-2 text-[12.5px] text-amaco-fg"
                >
                  <div>{c.body}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10.5px] text-amaco-fg-muted">
                    <span className="amaco-mono">{c.target}</span>
                    <span className="amaco-mono">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => resolveComment(c.id)}
                      disabled={busy === c.id}
                      className="ml-auto inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-[10.5px] text-amaco-fg-dim hover:text-amaco-fg"
                    >
                      <Check className="h-3 w-3" strokeWidth={1.5} /> resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {resolved.length > 0 ? (
            <div className="mt-3 space-y-1.5 opacity-60">
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
                resolved ({resolved.length})
              </div>
              {resolved.map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-amaco-border bg-amaco-panel-2 p-2 text-[12.5px] text-amaco-fg-dim"
                >
                  <div className="line-through">{c.body}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
