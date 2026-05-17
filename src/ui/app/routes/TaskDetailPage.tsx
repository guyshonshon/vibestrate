import { useEffect, useState } from "react";
import { Check, ExternalLink, FileCode, Lock } from "lucide-react";
import { api } from "../../lib/api.js";
import { navigate } from "../App.js";
import type {
  ChangedFile,
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
          {task.effort ? (
            <span
              className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]"
              title="Maps to a provider via project.yml#effortMap."
            >
              effort: {task.effort}
            </span>
          ) : null}
          {task.providerOverride ? (
            <span
              className="amaco-mono rounded border border-amaco-accent/40 px-1.5 py-0.5 text-[10.5px] text-amaco-accent"
              title="Every agent in runs spawned from this task uses this provider."
            >
              provider: {task.providerOverride}
            </span>
          ) : null}
          {task.readOnly ? (
            <span
              className="amaco-mono rounded border border-amaco-warn/60 bg-amaco-warn/15 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-amaco-warn"
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
    <section className="rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        dependencies
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] text-amaco-fg-muted">
            Blocked by ({blockers.length + missingBlockers.length})
          </div>
          {blockers.length === 0 && missingBlockers.length === 0 ? (
            <div className="mt-1 text-[12px] text-amaco-fg-muted">—</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {blockers.map((b) => {
                const open = !isDone(b.status);
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => onOpenTask(b.id)}
                      className="flex w-full items-center gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-left hover:bg-amaco-panel"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${open ? "bg-amaco-warn" : "bg-amaco-success"}`}
                      />
                      <span className="amaco-mono flex-1 truncate text-[12px] text-amaco-fg">
                        {b.title}
                      </span>
                      <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                        {b.status}
                      </span>
                    </button>
                  </li>
                );
              })}
              {missingBlockers.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded border border-amaco-fail/40 bg-amaco-fail/5 px-2 py-1 text-[12px] text-amaco-fail"
                >
                  <span className="amaco-mono flex-1 truncate">{id}</span>
                  <span className="amaco-mono text-[10.5px]">missing</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[11px] text-amaco-fg-muted">
            Unlocks ({unlocks.length})
          </div>
          {unlocks.length === 0 ? (
            <div className="mt-1 text-[12px] text-amaco-fg-muted">—</div>
          ) : (
            <ul className="mt-1 space-y-1">
              {unlocks.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => onOpenTask(u.id)}
                    className="flex w-full items-center gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-left hover:bg-amaco-panel"
                  >
                    <span className="amaco-mono flex-1 truncate text-[12px] text-amaco-fg">
                      {u.title}
                    </span>
                    <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
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
    <section className="rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        Files
      </div>
      {task.touchedFiles.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10.5px] text-amaco-fg-muted">
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
          <div className="text-[10.5px] text-amaco-fg-muted">
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
      className={`flex w-full items-center gap-1.5 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-left text-[11.5px] ${
        redacted
          ? "text-amaco-warn opacity-80"
          : "text-amaco-fg-dim hover:border-amaco-accent/40 hover:text-amaco-fg"
      }`}
      title={redacted ? "Secret file — contents redacted" : path}
    >
      {redacted ? (
        <Lock className="h-3 w-3 shrink-0" strokeWidth={1.5} />
      ) : (
        <FileCode className="h-3 w-3 shrink-0" strokeWidth={1.5} />
      )}
      <span className="truncate amaco-mono">{path}</span>
      {status ? (
        <span className="amaco-mono ml-auto rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
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

  async function setField<K extends "effort" | "providerOverride" | "readOnly">(
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
    <div className="mt-3 grid grid-cols-1 gap-2 rounded border border-amaco-border bg-amaco-panel-2 p-2 text-[12px] md:grid-cols-3">
      {showSuggestion ? (
        <div className="md:col-span-3 flex flex-wrap items-center gap-2 rounded border border-amaco-accent/30 bg-amaco-accent-soft/15 px-2 py-1 text-[11.5px]">
          <span className="amaco-mono text-[10.5px] uppercase tracking-[0.10em] text-amaco-accent">
            heuristic suggests
          </span>
          <span className="amaco-mono font-medium text-amaco-fg">
            {heuristic!.effort}
          </span>
          <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
            @ confidence {heuristic!.confidence}
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void setField("effort", heuristic!.effort)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-amaco-accent/50 bg-amaco-accent/15 px-1.5 py-0.5 text-[11px] text-amaco-accent hover:bg-amaco-accent/25 disabled:opacity-50"
            title="Apply the heuristic verdict to this task's effort field."
          >
            apply
          </button>
          {heuristic!.reasons.length > 0 ? (
            <details className="basis-full">
              <summary className="cursor-pointer text-[10.5px] text-amaco-fg-muted">
                why?
              </summary>
              <ul className="mt-1 space-y-0.5">
                {heuristic!.reasons.map((r) => (
                  <li
                    key={r}
                    className="text-[10.5px] text-amaco-fg-dim"
                  >
                    · {r}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : heuristic !== null && task.effort === heuristic.effort ? (
        <div className="md:col-span-3 text-[10.5px] text-amaco-success">
          ✓ effort matches the heuristic suggestion @ {heuristic.confidence}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span
          className="amaco-mono text-[10px] uppercase tracking-[0.12em] text-amaco-fg-muted"
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
          className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1.5 py-1 text-[11.5px] text-amaco-fg focus:border-amaco-accent/60 focus:outline-none"
        >
          <option value="">— none —</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span
          className="amaco-mono text-[10px] uppercase tracking-[0.12em] text-amaco-fg-muted"
          title="Pin every agent in runs spawned from this task to a specific provider id. Wins over effort."
        >
          provider override
        </span>
        <input
          type="text"
          value={task.providerOverride ?? ""}
          disabled={busy !== null}
          placeholder="e.g. codex"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v === (task.providerOverride ?? "")) return;
            void setField("providerOverride", v.length === 0 ? null : v);
          }}
          className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1.5 py-1 text-[11.5px] text-amaco-fg placeholder:text-amaco-fg-muted focus:border-amaco-accent/60 focus:outline-none"
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
          className="amaco-mono text-[11px] uppercase tracking-[0.10em] text-amaco-fg-dim"
          title="Investigation-only: runs spawned from this task skip executor + fix loop and refuse apply/validate/revert."
        >
          read-only
        </span>
      </label>

      {error ? (
        <div className="md:col-span-3 rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-[10.5px] text-amaco-fail">
          {error}
        </div>
      ) : null}
    </div>
  );
}
