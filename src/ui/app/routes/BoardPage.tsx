import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import type { RoadmapItem, Task, TaskStatus } from "../../lib/types.js";
import { TaskCard } from "../../components/board/TaskCard.js";

const COLUMNS: { id: string; label: string; statuses: TaskStatus[] }[] = [
  { id: "ideas", label: "Ideas", statuses: ["backlog"] },
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "queued", label: "Queued", statuses: ["queued"] },
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "waiting", label: "Waiting Approval", statuses: ["waiting_for_approval"] },
  { id: "review", label: "Review", statuses: ["review"] },
  { id: "blocked", label: "Blocked", statuses: ["blocked", "failed"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

export function BoardPage({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showRoadmapForm, setShowRoadmapForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskRoadmap, setNewTaskRoadmap] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [t, r] = await Promise.all([api.listTasks(), api.listRoadmap()]);
      setTasks(t);
      setItems(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  async function submitRoadmap(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoadmapTitle.trim()) return;
    setBusy(true);
    try {
      await api.addRoadmapItem({ title: newRoadmapTitle.trim() });
      setNewRoadmapTitle("");
      setShowRoadmapForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setBusy(true);
    try {
      await api.addTask({
        title: newTaskTitle.trim(),
        roadmapItemId: newTaskRoadmap || null,
      });
      setNewTaskTitle("");
      setNewTaskRoadmap("");
      setShowTaskForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return <div className="px-6 py-8 text-amaco-fail">{error}</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              roadmap board
            </div>
            <h1 className="mt-1 text-[16px] font-medium">
              Break ideas into supervised tasks
            </h1>
            <div className="mt-1 text-[12.5px] text-amaco-fg-dim">
              Inside one task, agents run in order. Across tasks, the scheduler can run several at once if you opt in.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowRoadmapForm((v) => !v);
                setShowTaskForm(false);
              }}
              className="inline-flex items-center gap-1.5 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[12px] text-amaco-fg-dim hover:bg-amaco-panel"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Roadmap item
            </button>
            <button
              onClick={() => {
                setShowTaskForm((v) => !v);
                setShowRoadmapForm(false);
              }}
              className="inline-flex items-center gap-1.5 rounded border border-amaco-accent/40 bg-amaco-accent/10 px-2 py-1 text-[12px] text-amaco-accent hover:bg-amaco-accent/20"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              Task
            </button>
          </div>
        </div>
        {showRoadmapForm ? (
          <form onSubmit={submitRoadmap} className="mt-3 flex gap-2">
            <input
              autoFocus
              value={newRoadmapTitle}
              onChange={(e) => setNewRoadmapTitle(e.target.value)}
              placeholder="Build onboarding flow"
              className="amaco-mono flex-1 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[12.5px] text-amaco-fg placeholder-amaco-fg-muted"
            />
            <button
              type="submit"
              disabled={busy || !newRoadmapTitle.trim()}
              className="rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-1 text-[12px] text-amaco-fg hover:bg-amaco-panel disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : null}
        {showTaskForm ? (
          <form onSubmit={submitTask} className="mt-3 flex gap-2">
            <input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Create setup wizard"
              className="amaco-mono flex-1 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[12.5px] text-amaco-fg placeholder-amaco-fg-muted"
            />
            <select
              value={newTaskRoadmap}
              onChange={(e) => setNewTaskRoadmap(e.target.value)}
              className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[12px] text-amaco-fg"
            >
              <option value="">no roadmap link</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !newTaskTitle.trim()}
              className="rounded border border-amaco-border bg-amaco-panel-2 px-2.5 py-1 text-[12px] text-amaco-fg hover:bg-amaco-panel disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : null}
      </header>

      {tasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-amaco-fg-muted">
          No tasks yet. Click <span className="mx-1 amaco-mono">Task</span> above.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[repeat(8,minmax(220px,1fr))] gap-2 overflow-x-auto p-3">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <section
                key={col.id}
                className="flex h-full flex-col rounded border border-amaco-border bg-amaco-panel"
              >
                <header className="flex items-center justify-between border-b border-amaco-border px-2 py-1.5">
                  <span className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
                    {col.label}
                  </span>
                  <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                    {colTasks.length}
                  </span>
                </header>
                <ol className="flex-1 space-y-1.5 overflow-y-auto p-1.5">
                  {colTasks.length === 0 ? (
                    <li className="px-1 py-1 text-[11px] text-amaco-fg-muted">—</li>
                  ) : (
                    colTasks.map((t) => (
                      <li key={t.id}>
                        <TaskCard task={t} onOpen={onOpenTask} />
                      </li>
                    ))
                  )}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
