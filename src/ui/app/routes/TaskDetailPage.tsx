import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ExternalLink,
  FileCode,
  FlaskConical,
  GripVertical,
  Lock,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { reorderByDrop } from "../../lib/reorder.js";
import { navigate } from "../App.js";
import type {
  ChangedFile,
  ChecklistItem,
  ChecklistItemStatus,
  MicroStep,
  Task,
  TaskComment,
} from "../../lib/types.js";
import { MicroStepPipeline } from "../../components/board/MicroStepPipeline.js";
import { TaskGitActivity } from "../../components/tasks/TaskGitActivity.js";

export function TaskDetailPage({
  taskId,
  onOpenRun,
  onOpenTask,
}: {
  taskId: string;
  onOpenRun: (runId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [data, setData] = useState<{
    task: Task;
    comments: TaskComment[];
    microSteps: { runId: string; steps: MicroStep[] }[];
  } | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");

  async function load() {
    try {
      const [r, list] = await Promise.all([
        api.getTask(taskId),
        api.listTasks(),
      ]);
      setData(r);
      setAllTasks(list);
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

  async function toggleArchive(archived: boolean) {
    setBusy("archive");
    try {
      await api.setTaskArchived(taskId, archived);
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
    return <div className="px-6 py-8 text-vibestrate-fail">{error}</div>;
  if (!data)
    return <div className="px-6 py-8 text-vibestrate-fg-muted">Loading task…</div>;

  const { task, comments, microSteps } = data;
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-vibestrate-border bg-vibestrate-panel px-6 py-4">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
          task · {task.id}
        </div>
        {task.derivedFrom ? (
          <button
            type="button"
            onClick={() => onOpenTask(task.derivedFrom!.taskId)}
            className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-vibestrate-fg-muted hover:text-vibestrate-accent"
            title="This card was promoted from a checklist item on another card."
          >
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
            derived from {task.derivedFrom.taskId}
          </button>
        ) : null}
        <h1 className="mt-1 text-[16px] font-medium">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-vibestrate-fg-dim">
          <span className="vibestrate-mono rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px]">
            {task.status}
          </span>
          <span className="vibestrate-mono rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px]">
            priority: {task.priority}
          </span>
          <span className="vibestrate-mono rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px]">
            risk: {task.riskLevel}
          </span>
          {task.roadmapItemId ? (
            <span className="vibestrate-mono text-vibestrate-fg-muted">
              roadmap: {task.roadmapItemId}
            </span>
          ) : null}
          {task.effort ? (
            <span
              className="vibestrate-mono rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px]"
              title="Maps to a provider via project.yml#effortMap."
            >
              effort: {task.effort}
            </span>
          ) : null}
          {task.profileOverride ? (
            <span
              className="vibestrate-mono rounded border border-vibestrate-accent/40 px-1.5 py-0.5 text-[10.5px] text-vibestrate-accent"
              title="Every agent in runs spawned from this task uses this provider."
            >
              provider: {task.profileOverride}
            </span>
          ) : null}
          {task.readOnly ? (
            <span
              className="vibestrate-mono rounded border border-vibestrate-warn/60 bg-vibestrate-warn/15 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-vibestrate-warn"
              title="Investigation-only — runs spawned from this task skip executor + fix loop and refuse apply/validate/revert."
            >
              read-only
            </span>
          ) : null}
        </div>
        <TaskRunMode
          task={task}
          onPatched={(next) =>
            setData((d) => (d ? { ...d, task: next } : d))
          }
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={queue}
            disabled={
              busy !== null ||
              task.status === "queued" ||
              task.status === "running"
            }
            className="rounded border border-vibestrate-accent/40 bg-vibestrate-accent/10 px-2.5 py-1 text-[12px] text-vibestrate-accent hover:bg-vibestrate-accent/20 disabled:opacity-50"
          >
            {busy === "queue" ? "Queueing…" : "Queue task"}
          </button>
          <button
            onClick={cancel}
            disabled={busy !== null || task.status === "cancelled"}
            className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2.5 py-1 text-[12px] text-vibestrate-fg-dim hover:bg-vibestrate-panel disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => toggleArchive(!task.archived)}
            disabled={busy !== null}
            className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2.5 py-1 text-[12px] text-vibestrate-fg-dim hover:bg-vibestrate-panel disabled:opacity-50"
          >
            {busy === "archive"
              ? "…"
              : task.archived
                ? "Un-archive"
                : "Archive"}
          </button>
          <span className="ml-auto text-[10.5px] text-vibestrate-fg-muted">
            Run from CLI:{" "}
            <code className="vibestrate-mono rounded bg-vibestrate-panel-2 px-1 py-0.5">
              vibe tasks run {task.id}
            </code>
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {task.needsTesting ? (
          <NeedsTestingBanner task={task} onResolved={load} />
        ) : null}
        {task.description ? (
          <section className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
              description
            </div>
            <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-vibestrate-fg">
              {task.description}
            </div>
          </section>
        ) : null}

        <ChecklistSection task={task} onChanged={load} onOpenTask={onOpenTask} />

        <ContextSourcesSection task={task} onChanged={load} />

        <section className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
            runs
          </div>
          {task.runIds.length === 0 ? (
            <div className="mt-1 text-[12px] text-vibestrate-fg-muted">No runs yet.</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {task.runIds.map((rid) => (
                <li key={rid}>
                  <button
                    onClick={() => onOpenRun(rid)}
                    className="vibestrate-mono inline-flex items-center gap-1.5 text-[12px] text-vibestrate-fg-dim hover:text-vibestrate-fg"
                  >
                    <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                    {rid}
                    {rid === task.currentRunId ? (
                      <span className="vibestrate-mono ml-1 rounded border border-vibestrate-accent/50 px-1 text-[10px] text-vibestrate-accent">
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

        <TaskGitActivity
          runIds={task.runIds}
          onOpenRun={onOpenRun}
          onOpenGit={(rid) =>
            navigate({ kind: "git", runId: rid })
          }
        />

        <FilesSection task={task} />


        <DependenciesSection
          task={task}
          allTasks={allTasks}
          onOpenTask={onOpenTask}
        />

        <section className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
            comments
          </div>
          <form onSubmit={submitComment} className="mt-2 flex gap-2">
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment (saved to .vibestrate/roadmap/comments/<task>.json)"
              className="flex-1 resize-y rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1.5 text-[12.5px] text-vibestrate-fg placeholder-vibestrate-fg-muted"
            />
            <button
              type="submit"
              disabled={busy === "comment" || !newComment.trim()}
              className="self-start rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2.5 py-1 text-[12px] text-vibestrate-fg hover:bg-vibestrate-panel disabled:opacity-50"
            >
              {busy === "comment" ? "Saving…" : "Add"}
            </button>
          </form>
          {open.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
                open ({open.length})
              </div>
              {open.map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2 text-[12.5px] text-vibestrate-fg"
                >
                  <div>{c.body}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10.5px] text-vibestrate-fg-muted">
                    <span className="vibestrate-mono">{c.target}</span>
                    <span className="vibestrate-mono">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => resolveComment(c.id)}
                      disabled={busy === c.id}
                      className="ml-auto inline-flex items-center gap-1 rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:text-vibestrate-fg"
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
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
                resolved ({resolved.length})
              </div>
              {resolved.map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2 text-[12.5px] text-vibestrate-fg-dim"
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

function DependenciesSection({
  task,
  allTasks,
  onOpenTask,
}: {
  task: Task;
  allTasks: Task[];
  onOpenTask: (taskId: string) => void;
}) {
  const blockers = task.dependencies
    .map((id) => allTasks.find((t) => t.id === id) ?? null)
    .filter((t): t is Task => t !== null);
  const missingBlockers = task.dependencies.filter(
    (id) => !allTasks.find((t) => t.id === id),
  );
  const unlocks = allTasks.filter((t) => t.dependencies.includes(task.id));

  if (
    blockers.length === 0 &&
    missingBlockers.length === 0 &&
    unlocks.length === 0
  ) {
    return null;
  }

  const isDone = (s: Task["status"]) => s === "done" || s === "cancelled";

  return (
    <section className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        dependencies
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] text-vibestrate-fg-muted">
            Blocked by ({blockers.length + missingBlockers.length})
          </div>
          {blockers.length === 0 && missingBlockers.length === 0 ? (
            <div className="mt-1 text-[12px] text-vibestrate-fg-muted">—</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {blockers.map((b) => {
                const open = !isDone(b.status);
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => onOpenTask(b.id)}
                      className="flex w-full items-center gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-left hover:bg-vibestrate-panel"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${open ? "bg-vibestrate-warn" : "bg-vibestrate-success"}`}
                      />
                      <span className="vibestrate-mono flex-1 truncate text-[12px] text-vibestrate-fg">
                        {b.title}
                      </span>
                      <span className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
                        {b.status}
                      </span>
                    </button>
                  </li>
                );
              })}
              {missingBlockers.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded border border-vibestrate-fail/40 bg-vibestrate-fail/5 px-2 py-1 text-[12px] text-vibestrate-fail"
                >
                  <span className="vibestrate-mono flex-1 truncate">{id}</span>
                  <span className="vibestrate-mono text-[10.5px]">missing</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[11px] text-vibestrate-fg-muted">
            Unlocks ({unlocks.length})
          </div>
          {unlocks.length === 0 ? (
            <div className="mt-1 text-[12px] text-vibestrate-fg-muted">—</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {unlocks.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => onOpenTask(u.id)}
                    className="flex w-full items-center gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-left hover:bg-vibestrate-panel"
                  >
                    <span className="vibestrate-mono flex-1 truncate text-[12px] text-vibestrate-fg">
                      {u.title}
                    </span>
                    <span className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
                      {u.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function NeedsTestingBanner({
  task,
  onResolved,
}: {
  task: Task;
  onResolved: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verdict(v: "pass" | "fail") {
    setBusy(v);
    setError(null);
    try {
      await api.resolveNeedsTesting(task.id, v);
      await onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded border border-vibestrate-warn/50 bg-vibestrate-warn/10 p-3">
      <div className="flex items-start gap-2">
        <FlaskConical
          className="mt-0.5 h-4 w-4 shrink-0 text-vibestrate-warn"
          strokeWidth={1.7}
        />
        <div className="flex-1">
          <div className="text-[12.5px] font-medium text-vibestrate-warn">
            Needs testing — a human should check this
          </div>
          <div className="mt-0.5 text-[12px] text-vibestrate-fg-dim">
            {task.needsTestingReason ||
              "A run finished but flagged something for human review (e.g. visual / UX the model can't perceive)."}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => verdict("pass")}
              disabled={busy !== null}
              className="rounded border border-vibestrate-success/50 bg-vibestrate-success/15 px-2 py-1 text-[12px] text-vibestrate-success hover:bg-vibestrate-success/25 disabled:opacity-50"
            >
              {busy === "pass" ? "…" : "Looks good → Done"}
            </button>
            <button
              type="button"
              onClick={() => verdict("fail")}
              disabled={busy !== null}
              className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12px] text-vibestrate-fg-dim hover:bg-vibestrate-panel disabled:opacity-50"
            >
              {busy === "fail" ? "…" : "Needs work → Reopen"}
            </button>
          </div>
          {error ? (
            <div className="mt-1 text-[10.5px] text-vibestrate-fail">{error}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ContextSourcesSection({
  task,
  onChanged,
}: {
  task: Task;
  onChanged: () => Promise<void> | void;
}) {
  const sources = task.contextSources ?? [];
  const [kind, setKind] = useState<"file" | "url">("file");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: { kind: "file" | "url"; ref: string }[]) {
    setBusy(true);
    setError(null);
    try {
      await api.setTaskContextSources(task.id, next);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = ref.trim();
    if (!r) return;
    await save([...sources.map((s) => ({ kind: s.kind, ref: s.ref })), { kind, ref: r }]);
    setRef("");
  }

  return (
    <section className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        context sources
      </div>
      <div className="mt-0.5 text-[10.5px] text-vibestrate-fg-muted">
        Files / URLs injected into every agent prompt for this card's runs (path-guarded, SSRF-guarded, secrets redacted).
      </div>
      {sources.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {sources.map((s, i) => (
            <li
              key={`${s.kind}-${s.ref}-${i}`}
              className="flex items-center gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1"
            >
              <span className="vibestrate-mono shrink-0 rounded border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-muted">
                {s.kind}
              </span>
              {s.kind === "url" ? (
                <ExternalLink className="h-3 w-3 shrink-0 text-vibestrate-warn" strokeWidth={1.5} />
              ) : (
                <FileCode className="h-3 w-3 shrink-0 text-vibestrate-fg-muted" strokeWidth={1.5} />
              )}
              <span className="vibestrate-mono flex-1 truncate text-[12px] text-vibestrate-fg">
                {s.ref}
              </span>
              <button
                type="button"
                onClick={() =>
                  save(
                    sources
                      .filter((_, j) => j !== i)
                      .map((x) => ({ kind: x.kind, ref: x.ref })),
                  )
                }
                disabled={busy}
                className="shrink-0 text-vibestrate-fg-muted hover:text-vibestrate-fail disabled:opacity-50"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="mt-2 flex gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "file" | "url")}
          className="vibestrate-mono rounded border border-vibestrate-border bg-vibestrate-panel-2 px-1 py-1 text-[11px] text-vibestrate-fg-dim"
        >
          <option value="file">file</option>
          <option value="url">url</option>
        </select>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={kind === "file" ? "path/in/project.md" : "https://…"}
          className="flex-1 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12.5px] text-vibestrate-fg placeholder-vibestrate-fg-muted focus:border-vibestrate-accent/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !ref.trim()}
          className="inline-flex items-center gap-1 self-start rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2.5 py-1 text-[12px] text-vibestrate-fg hover:bg-vibestrate-panel disabled:opacity-50"
        >
          <Plus className="h-3 w-3" strokeWidth={1.5} />
          Add
        </button>
      </form>
      {error ? (
        <div className="mt-2 rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-[10.5px] text-vibestrate-fail">
          {error}
        </div>
      ) : null}
    </section>
  );
}

const CHECKLIST_STATUSES: ChecklistItemStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
];

function checklistGlyph(s: ChecklistItemStatus): string {
  return s === "done" ? "●" : s === "in_progress" ? "◐" : s === "blocked" ? "⊘" : "○";
}

function ChecklistSection({
  task,
  onChanged,
  onOpenTask,
}: {
  task: Task;
  onChanged: () => Promise<void> | void;
  onOpenTask: (taskId: string) => void;
}) {
  const items = task.checklist ?? [];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [proposed, setProposed] = useState<string[] | null>(null);
  const [stepMode, setStepMode] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);
  const done = items.filter((i) => i.status === "done").length;
  const pending = items.filter((i) => i.status !== "done").length;
  const pct = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  async function pickup() {
    setLaunched(null);
    await run("pickup", async () => {
      await api.spawnRun({
        task: task.title,
        taskId: task.id,
        flow: { id: "pickup" },
        checklistMode: stepMode ? "step" : "continuous",
      });
      setLaunched(
        `Pick-up run started (${stepMode ? "step-by-step" : "continuous"}). Watch it in Runs / Mission Control.`,
      );
    });
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    await run("add", async () => {
      await api.addChecklistItem(task.id, t);
      setText("");
    });
  }

  async function enhance() {
    setProposed(null);
    await run("enhance", async () => {
      const r = await api.enhanceChecklist(task.id, { apply: false });
      setProposed(r.proposal.items);
    });
  }

  async function acceptProposed() {
    const toAdd = proposed ?? [];
    await run("accept", async () => {
      for (const t of toAdd) {
        await api.addChecklistItem(task.id, t);
      }
      setProposed(null);
    });
  }

  // Drop `draggingId` at the position currently occupied by `targetId`.
  function reorderTo(targetId: string) {
    const dragId = draggingId;
    setDraggingId(null);
    setOverId(null);
    if (!dragId || dragId === targetId) return;
    const before = items.map((i) => i.id);
    const after = reorderByDrop(before, dragId, targetId);
    if (after.join(" ") === before.join(" ")) return;
    void run(`move-${dragId}`, () => api.reorderChecklist(task.id, after));
  }

  return (
    <section className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
      <div className="flex items-center gap-2">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
          checklist
        </div>
        {items.length > 0 ? (
          <>
            <span className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
              {done}/{items.length}
            </span>
            <div className="ml-1 h-1 w-24 overflow-hidden rounded-full bg-vibestrate-panel-2">
              <div
                className="h-full bg-vibestrate-success transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : null}
        <button
          type="button"
          onClick={enhance}
          disabled={busy !== null}
          title="Propose a checklist with an AI assist (read-only — you choose whether to add the items)"
          className="ml-auto inline-flex items-center gap-1 rounded border border-vibestrate-accent/40 bg-vibestrate-accent/10 px-1.5 py-0.5 text-[10.5px] text-vibestrate-accent hover:bg-vibestrate-accent/20 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" strokeWidth={1.5} />
          {busy === "enhance" ? "Thinking…" : "Enhance"}
        </button>
      </div>

      {proposed ? (
        <div className="mt-2 rounded border border-vibestrate-accent/30 bg-vibestrate-accent-soft/10 p-2">
          <div className="flex items-center gap-2">
            <span className="vibestrate-mono text-[10px] uppercase tracking-[0.10em] text-vibestrate-accent">
              proposed ({proposed.length}) — not added yet
            </span>
            <button
              type="button"
              onClick={acceptProposed}
              disabled={busy !== null || proposed.length === 0}
              className="ml-auto rounded border border-vibestrate-accent/50 bg-vibestrate-accent/15 px-1.5 py-0.5 text-[11px] text-vibestrate-accent hover:bg-vibestrate-accent/25 disabled:opacity-50"
            >
              {busy === "accept" ? "Adding…" : "Add all"}
            </button>
            <button
              type="button"
              onClick={() => setProposed(null)}
              disabled={busy !== null}
              className="rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-0.5 text-[11px] text-vibestrate-fg-dim hover:text-vibestrate-fg disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
          <ol className="mt-1.5 space-y-0.5">
            {proposed.map((t, i) => (
              <li key={i} className="text-[12px] text-vibestrate-fg">
                <span className="vibestrate-mono text-vibestrate-fg-muted">
                  {i + 1}.
                </span>{" "}
                {t}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-2 text-[12px] text-vibestrate-fg-muted">
          No items yet. Break this card into a concrete ordered checklist below.
        </div>
      ) : (
        <ul
          className="mt-2 space-y-1"
          onDragOver={(e) => e.preventDefault()}
        >
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              busy={busy}
              dragging={draggingId === item.id}
              dragOver={overId === item.id && draggingId !== item.id}
              onDragStart={() => setDraggingId(item.id)}
              onDragEnter={() => {
                if (draggingId && draggingId !== item.id) setOverId(item.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverId(null);
              }}
              onDrop={() => reorderTo(item.id)}
              onToggle={() =>
                run(`s-${item.id}`, () =>
                  api.updateChecklistItem(task.id, item.id, {
                    status: item.status === "done" ? "pending" : "done",
                  }),
                )
              }
              onStatus={(status) =>
                run(`s-${item.id}`, () =>
                  api.updateChecklistItem(task.id, item.id, { status }),
                )
              }
              onEdit={(next) =>
                run(`e-${item.id}`, () =>
                  api.updateChecklistItem(task.id, item.id, { text: next }),
                )
              }
              onRemove={() =>
                run(`r-${item.id}`, () =>
                  api.removeChecklistItem(task.id, item.id),
                )
              }
              onPromote={() =>
                run(`p-${item.id}`, () =>
                  api.promoteChecklistItem(task.id, item.id),
                )
              }
              onOpenCard={onOpenTask}
            />
          ))}
        </ul>
      )}

      {items.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1.5">
          <button
            type="button"
            onClick={pickup}
            disabled={busy !== null || pending === 0}
            title="Execute the checklist item-by-item in one run (a commit per item)."
            className="inline-flex items-center gap-1 rounded border border-vibestrate-accent/50 bg-vibestrate-accent/15 px-2 py-1 text-[12px] text-vibestrate-accent hover:bg-vibestrate-accent/25 disabled:opacity-50"
          >
            {busy === "pickup"
              ? "Starting…"
              : `Run checklist (${pending} item${pending === 1 ? "" : "s"})`}
          </button>
          <label className="flex items-center gap-1 text-[11px] text-vibestrate-fg-dim">
            <input
              type="checkbox"
              checked={stepMode}
              onChange={(e) => setStepMode(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            step-by-step
          </label>
          {launched ? (
            <span className="text-[10.5px] text-vibestrate-success">{launched}</span>
          ) : (
            <span className="ml-auto text-[10.5px] text-vibestrate-fg-muted">
              one worktree · a commit per item · summaries carried forward
            </span>
          )}
        </div>
      ) : null}

      <form onSubmit={add} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a checklist item…"
          className="flex-1 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[12.5px] text-vibestrate-fg placeholder-vibestrate-fg-muted focus:border-vibestrate-accent/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy === "add" || !text.trim()}
          className="inline-flex items-center gap-1 self-start rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2.5 py-1 text-[12px] text-vibestrate-fg hover:bg-vibestrate-panel disabled:opacity-50"
        >
          <Plus className="h-3 w-3" strokeWidth={1.5} />
          {busy === "add" ? "Adding…" : "Add"}
        </button>
      </form>

      {error ? (
        <div className="mt-2 rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-[10.5px] text-vibestrate-fail">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function ChecklistRow({
  item,
  busy,
  dragging,
  dragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onToggle,
  onStatus,
  onEdit,
  onRemove,
  onPromote,
  onOpenCard,
}: {
  item: ChecklistItem;
  busy: string | null;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onToggle: () => void;
  onStatus: (status: ChecklistItemStatus) => void;
  onEdit: (text: string) => void;
  onRemove: () => void;
  onPromote: () => void;
  onOpenCard: (taskId: string) => void;
}) {
  const [draft, setDraft] = useState(item.text);
  // Drag is initiated only from the grip handle, so the text input stays
  // selectable. We flip the row's draggable flag on grip mousedown.
  const [grabbed, setGrabbed] = useState(false);
  // Keep the editable draft in sync when the item changes underneath us
  // (polling reload or another client).
  useEffect(() => {
    setDraft(item.text);
  }, [item.text]);
  const anyBusy = busy !== null;
  const glyphColor =
    item.status === "done"
      ? "text-vibestrate-success"
      : item.status === "in_progress"
        ? "text-vibestrate-accent"
        : item.status === "blocked"
          ? "text-vibestrate-warn"
          : "text-vibestrate-fg-muted";

  return (
    <li
      draggable={grabbed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={() => {
        setGrabbed(false);
        onDragEnd();
      }}
      onDrop={(e) => {
        e.preventDefault();
        setGrabbed(false);
        onDrop();
      }}
      className={`flex items-center gap-1.5 rounded border bg-vibestrate-panel-2 px-2 py-1 transition ${
        dragging
          ? "border-vibestrate-accent/50 opacity-50"
          : dragOver
            ? "border-vibestrate-accent/60 ring-1 ring-vibestrate-accent/40"
            : "border-vibestrate-border"
      }`}
    >
      <span
        role="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onMouseDown={() => setGrabbed(true)}
        onMouseUp={() => setGrabbed(false)}
        className="shrink-0 cursor-grab text-vibestrate-fg-muted hover:text-vibestrate-fg active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
      </span>
      <button
        type="button"
        onClick={onToggle}
        disabled={anyBusy}
        title={item.status === "done" ? "Mark pending" : "Mark done"}
        className={`shrink-0 text-[14px] leading-none ${glyphColor} disabled:opacity-50`}
      >
        {checklistGlyph(item.status)}
      </button>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next && next !== item.text) onEdit(next);
          else setDraft(item.text);
        }}
        className={`flex-1 bg-transparent text-[12.5px] focus:outline-none ${
          item.status === "done"
            ? "text-vibestrate-fg-muted line-through"
            : "text-vibestrate-fg"
        }`}
      />
      <select
        value={item.status}
        disabled={anyBusy}
        onChange={(e) => onStatus(e.target.value as ChecklistItemStatus)}
        className="vibestrate-mono shrink-0 rounded border border-vibestrate-border bg-vibestrate-panel px-1 py-0.5 text-[10px] text-vibestrate-fg-dim focus:border-vibestrate-accent/60 focus:outline-none"
        title="Item status"
      >
        {CHECKLIST_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {item.promotedTaskId ? (
        <button
          type="button"
          onClick={() => onOpenCard(item.promotedTaskId!)}
          title={`Promoted to card ${item.promotedTaskId}`}
          className="shrink-0 text-vibestrate-accent hover:text-vibestrate-fg"
        >
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onPromote}
          disabled={anyBusy}
          title="Promote this item to its own card"
          className="shrink-0 text-vibestrate-fg-muted hover:text-vibestrate-accent disabled:opacity-50"
        >
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={anyBusy}
        title="Remove item"
        className="shrink-0 text-vibestrate-fg-muted hover:text-vibestrate-fail disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </li>
  );
}

function FilesSection({ task }: { task: Task }) {
  const [runFiles, setRunFiles] = useState<ChangedFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const out: ChangedFile[] = [];
      for (const runId of task.runIds) {
        try {
          const snap = await api.getDiff(runId);
          if (snap) {
            for (const f of snap.files) out.push(f);
          }
        } catch {
          // skip stale runs
        }
      }
      if (!cancelled) setRunFiles(dedupe(out));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [task.runIds.join(",")]);

  if (
    task.touchedFiles.length === 0 &&
    runFiles.length === 0
  ) {
    return null;
  }

  return (
    <section className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        Files
      </div>
      {task.touchedFiles.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10.5px] text-vibestrate-fg-muted">
            declared (touchedFiles)
          </div>
          <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {task.touchedFiles.map((p) => (
              <li key={`d-${p}`}>
                <FileLink path={p} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {runFiles.length > 0 ? (
        <div className="mt-3">
          <div className="text-[10.5px] text-vibestrate-fg-muted">
            changed by linked runs
          </div>
          <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {runFiles.map((f) => (
              <li key={`r-${f.path}`}>
                <FileLink
                  path={f.path}
                  status={f.status}
                  redacted={f.isSecretLike}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function dedupe(files: ChangedFile[]): ChangedFile[] {
  const map = new Map<string, ChangedFile>();
  for (const f of files) {
    if (!map.has(f.path)) map.set(f.path, f);
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function FileLink({
  path,
  status,
  redacted,
}: {
  path: string;
  status?: string;
  redacted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        redacted
          ? undefined
          : navigate({
              kind: "codebase",
              filePath: path,
              line: null,
              runId: null,
            })
      }
      disabled={redacted}
      className={`flex w-full items-center gap-1.5 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-left text-[11.5px] ${
        redacted
          ? "text-vibestrate-warn opacity-80"
          : "text-vibestrate-fg-dim hover:border-vibestrate-accent/40 hover:text-vibestrate-fg"
      }`}
      title={redacted ? "Secret file — contents redacted" : path}
    >
      {redacted ? (
        <Lock className="h-3 w-3 shrink-0" strokeWidth={1.5} />
      ) : (
        <FileCode className="h-3 w-3 shrink-0" strokeWidth={1.5} />
      )}
      <span className="truncate vibestrate-mono">{path}</span>
      {status ? (
        <span className="vibestrate-mono ml-auto rounded border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-muted">
          {status}
        </span>
      ) : null}
    </button>
  );
}


function TaskRunMode({
  task,
  onPatched,
}: {
  task: Task;
  onPatched: (next: Task) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heuristic, setHeuristic] = useState<{
    effort: "low" | "medium" | "high";
    confidence: number;
    reasons: string[];
  } | null>(null);

  // Re-classify whenever the task's title/description/files change.
  // Heuristic is free + deterministic so this is safe to run on every
  // mount/update; the server route is one HTTP call but pure.
  useEffect(() => {
    let cancelled = false;
    api
      .classifyEffort({
        text: `${task.title}${task.description ? " " + task.description : ""}`,
        files: task.touchedFiles ?? [],
      })
      .then((r) => {
        if (!cancelled) setHeuristic(r);
      })
      .catch(() => {
        if (!cancelled) setHeuristic(null);
      });
    return () => {
      cancelled = true;
    };
  }, [task.title, task.description, task.touchedFiles?.join("|")]);

  async function setField<K extends "effort" | "profileOverride" | "readOnly">(
    field: K,
    value:
      | "low"
      | "medium"
      | "high"
      | null
      | boolean
      | string,
  ): Promise<void> {
    setBusy(field);
    setError(null);
    try {
      // Cast through the patch shape — the api method accepts a partial
      // and we know `field` matches `value` by construction.
      const next = await api.patchTask(task.id, {
        [field]: value as never,
      });
      onPatched(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Show the suggestion banner only when the heuristic disagrees with
  // what's currently saved (or when nothing is saved yet). Matching
  // verdicts get a quieter "✓ matches heuristic" hint inline.
  const showSuggestion =
    heuristic !== null && task.effort !== heuristic.effort;

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2 text-[12px] md:grid-cols-3">
      {showSuggestion ? (
        <div className="md:col-span-3 flex flex-wrap items-center gap-2 rounded border border-vibestrate-accent/30 bg-vibestrate-accent-soft/15 px-2 py-1 text-[11.5px]">
          <span className="vibestrate-mono text-[10.5px] uppercase tracking-[0.10em] text-vibestrate-accent">
            heuristic suggests
          </span>
          <span className="vibestrate-mono font-medium text-vibestrate-fg">
            {heuristic!.effort}
          </span>
          <span className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
            @ confidence {heuristic!.confidence}
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void setField("effort", heuristic!.effort)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-vibestrate-accent/50 bg-vibestrate-accent/15 px-1.5 py-0.5 text-[11px] text-vibestrate-accent hover:bg-vibestrate-accent/25 disabled:opacity-50"
            title="Apply the heuristic verdict to this task's effort field."
          >
            apply
          </button>
          {heuristic!.reasons.length > 0 ? (
            <details className="basis-full">
              <summary className="cursor-pointer text-[10.5px] text-vibestrate-fg-muted">
                why?
              </summary>
              <ul className="mt-1 space-y-0.5">
                {heuristic!.reasons.map((r) => (
                  <li
                    key={r}
                    className="text-[10.5px] text-vibestrate-fg-dim"
                  >
                    · {r}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : heuristic !== null && task.effort === heuristic.effort ? (
        <div className="md:col-span-3 text-[10.5px] text-vibestrate-success">
          ✓ effort matches the heuristic suggestion @ {heuristic.confidence}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span
          className="vibestrate-mono text-[10px] uppercase tracking-[0.12em] text-vibestrate-fg-muted"
          title="Maps to a provider via project.yml#effortMap. Leave unset to use each agent's configured provider."
        >
          effort
        </span>
        <select
          value={task.effort ?? ""}
          disabled={busy !== null}
          onChange={(e) =>
            void setField(
              "effort",
              e.target.value === ""
                ? null
                : (e.target.value as "low" | "medium" | "high"),
            )
          }
          className="vibestrate-mono rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-1 text-[11.5px] text-vibestrate-fg focus:border-vibestrate-accent/60 focus:outline-none"
        >
          <option value="">— none —</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span
          className="vibestrate-mono text-[10px] uppercase tracking-[0.12em] text-vibestrate-fg-muted"
          title="Pin every agent in runs spawned from this task to a specific provider id. Wins over effort."
        >
          provider override
        </span>
        <input
          type="text"
          value={task.profileOverride ?? ""}
          disabled={busy !== null}
          placeholder="e.g. codex"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v === (task.profileOverride ?? "")) return;
            void setField("profileOverride", v.length === 0 ? null : v);
          }}
          className="vibestrate-mono rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-1 text-[11.5px] text-vibestrate-fg placeholder:text-vibestrate-fg-muted focus:border-vibestrate-accent/60 focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-2 self-end">
        <input
          type="checkbox"
          checked={task.readOnly ?? false}
          disabled={busy !== null}
          onChange={(e) => void setField("readOnly", e.target.checked)}
          className="h-3.5 w-3.5"
        />
        <span
          className="vibestrate-mono text-[11px] uppercase tracking-[0.10em] text-vibestrate-fg-dim"
          title="Investigation-only: runs spawned from this task skip executor + fix loop and refuse apply/validate/revert."
        >
          read-only
        </span>
      </label>

      {error ? (
        <div className="md:col-span-3 rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-[10.5px] text-vibestrate-fail">
          {error}
        </div>
      ) : null}
    </div>
  );
}
