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
import { Select } from "../../components/design/Select.js";
import { Button } from "../../components/design/Button.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { StatTile } from "../../components/design/StatTile.js";
import { cn } from "../../components/design/cn.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { ConductorPanel } from "../../components/saga/ConductorPanel.js";

// Shared input recipe (contract §6, BoardPage idiom).
const INPUT =
  "rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

// A titled, contained card body for sections that aren't a full Section title.
const CARD = "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4";

// Status carries a meaning-based tone (same colour language as the Board
// columns): active=emerald, fail/blocked=rose, attention=amber, queued=violet.
function taskStatusTone(s: Task["status"]): ChipTone {
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
      return "neutral"; // backlog, ready, cancelled
  }
}

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
    return (
      <PageShell>
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
          {error}
        </div>
      </PageShell>
    );
  if (!data)
    return (
      <PageShell>
        <div className="text-[13px] text-chalk-300">Loading task…</div>
      </PageShell>
    );

  const { task, comments, microSteps } = data;
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);
  const queueDisabled =
    busy !== null || task.status === "queued" || task.status === "running";

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            {task.title}
            <span className="font-mono text-[12px] font-medium tabular-nums text-chalk-400">
              {task.id}
            </span>
          </span>
        }
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={queue}
              disabled={queueDisabled}
            >
              {busy === "queue"
                ? "Queueing…"
                : task.status === "running"
                  ? "Running"
                  : task.status === "queued"
                    ? "Queued"
                    : "Queue task"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={cancel}
              disabled={busy !== null || task.status === "cancelled"}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleArchive(!task.archived)}
              disabled={busy !== null}
            >
              {busy === "archive"
                ? "…"
                : task.archived
                  ? "Un-archive"
                  : "Archive"}
            </Button>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {task.derivedFrom ? (
            <button
              type="button"
              onClick={() => onOpenTask(task.derivedFrom!.taskId)}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-chalk-300 transition hover:text-violet-soft"
              title="This card was promoted from a checklist item on another card."
            >
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.9} />
              derived from {task.derivedFrom.taskId}
            </button>
          ) : null}
          <Chip tone={taskStatusTone(task.status)} contained>
            {task.status}
          </Chip>
          <Chip tone="neutral" contained>
            priority: {task.priority}
          </Chip>
          <Chip tone="neutral" contained>
            risk: {task.riskLevel}
          </Chip>
          {task.roadmapItemId ? (
            <Chip tone="sky" contained>
              roadmap: {task.roadmapItemId}
            </Chip>
          ) : null}
          {task.profileOverride ? (
            <Chip
              tone="violet"
              contained
              className="cursor-default"
            >
              provider: {task.profileOverride}
            </Chip>
          ) : null}
          {task.readOnly ? (
            <Chip tone="amber" contained className="cursor-default">
              <Lock className="h-2.5 w-2.5" strokeWidth={1.9} /> read-only
            </Chip>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-chalk-300">
            Run from CLI:
            <code className="rounded-[7px] bg-coal-500 px-1.5 py-0.5 font-mono text-[11px] text-chalk-200">
              vibe tasks run {task.id}
            </code>
          </span>
        </div>
        <TaskRunMode
          task={task}
          onPatched={(next) =>
            setData((d) => (d ? { ...d, task: next } : d))
          }
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        {task.needsTesting ? (
          <NeedsTestingBanner task={task} onResolved={load} />
        ) : null}
        {task.description ? (
          <Section title="Description">
            <div className={CARD}>
              <div className="whitespace-pre-wrap text-[12.5px] text-chalk-200">
                {task.description}
              </div>
            </div>
          </Section>
        ) : null}

        {task.acceptanceCriteria || task.est ? (
          <Section
            title="Acceptance criteria"
            action={
              task.est ? (
                <StatTile value={task.est} label="est" tone="violet" />
              ) : null
            }
          >
            <div className={CARD}>
              {task.acceptanceCriteria ? (
                <div className="whitespace-pre-wrap text-[12.5px] text-chalk-200">
                  {task.acceptanceCriteria}
                </div>
              ) : (
                <div className="text-[12px] text-chalk-400">
                  No acceptance criteria yet.
                </div>
              )}
            </div>
          </Section>
        ) : null}

        {task.runMode === "supervised" ? <ConductorPanel taskId={task.id} /> : null}

        <ChecklistSection task={task} onChanged={load} onOpenTask={onOpenTask} />

        <ContextSourcesSection task={task} onChanged={load} />

        <Section title="Runs">
          <div className={CARD}>
            {task.runIds.length === 0 ? (
              <div className="text-[12px] text-chalk-400">No runs yet.</div>
            ) : (
              <ul className="space-y-1">
                {task.runIds.map((rid) => (
                  <li key={rid}>
                    <button
                      onClick={() => onOpenRun(rid)}
                      className="inline-flex items-center gap-1.5 font-mono text-[12px] text-chalk-300 transition hover:text-chalk-100"
                    >
                      <ExternalLink className="h-3 w-3" strokeWidth={1.9} />
                      {rid}
                      {rid === task.currentRunId ? (
                        <Chip tone="violet" contained className="ml-1">
                          current
                        </Chip>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

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
          onChanged={load}
        />

        <Section title="Comments">
          <div className={CARD}>
            <form onSubmit={submitComment} className="flex gap-2">
              <textarea
                rows={2}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment (saved to .vibestrate/roadmap/comments/<task>.json)"
                className={cn(INPUT, "flex-1 resize-y")}
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={busy === "comment" || !newComment.trim()}
              >
                {busy === "comment" ? "Saving…" : "Add"}
              </Button>
            </form>
            {open.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                <div className="text-[11px] font-medium text-violet-soft">
                  Open ({open.length})
                </div>
                {open.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500 p-2.5 text-[12.5px] text-chalk-100"
                  >
                    <div>{c.body}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10.5px] text-chalk-400">
                      <span className="font-mono">{c.target}</span>
                      <span className="font-mono">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => resolveComment(c.id)}
                        disabled={busy === c.id}
                        className="ml-auto inline-flex items-center gap-1 rounded-[7px] bg-coal-600 px-1.5 py-0.5 text-[10.5px] text-chalk-300 transition hover:text-chalk-100 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" strokeWidth={1.9} /> resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {resolved.length > 0 ? (
              <div className="mt-3 space-y-1.5 opacity-60">
                <div className="text-[11px] font-medium text-violet-soft">
                  Resolved ({resolved.length})
                </div>
                {resolved.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500 p-2.5 text-[12.5px] text-chalk-300"
                  >
                    <div className="line-through">{c.body}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Section>
      </div>
    </PageShell>
  );
}

function DependenciesSection({
  task,
  allTasks,
  onOpenTask,
  onChanged,
}: {
  task: Task;
  allTasks: Task[];
  onOpenTask: (taskId: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const blockers = task.dependencies
    .map((id) => allTasks.find((t) => t.id === id) ?? null)
    .filter((t): t is Task => t !== null);
  const missingBlockers = task.dependencies.filter(
    (id) => !allTasks.find((t) => t.id === id),
  );
  const unlocks = allTasks.filter((t) => t.dependencies.includes(task.id));
  // Candidates to depend on: any other task not already a blocker.
  const candidates = allTasks.filter(
    (t) => t.id !== task.id && !task.dependencies.includes(t.id),
  );

  const isDone = (s: Task["status"]) => s === "done" || s === "cancelled";

  async function setDeps(next: string[]) {
    setBusy(true);
    setError(null);
    try {
      await api.patchTask(task.id, { dependencies: next });
      setAdding(false);
      await onChanged();
    } catch (err) {
      // The server rejects a cycle / self / unknown dependency with a 400.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Dependencies"
      action={
        candidates.length > 0 ? (
          <button
            onClick={() => {
              setError(null);
              setAdding((v) => !v);
            }}
            className="text-[12.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
          >
            {adding ? "Cancel" : "+ Add blocker"}
          </button>
        ) : null
      }
    >
      <div className={CARD}>
        {adding ? (
          <div className="mb-2 flex items-center gap-2">
            <Select
              value=""
              disabled={busy}
              ariaLabel="This task is blocked by"
              placeholder="This task is blocked by..."
              className="min-w-0 flex-1"
              onChange={(v) => {
                if (v) void setDeps([...task.dependencies, v]);
              }}
              options={candidates.map((c) => ({ value: c.id, label: c.title }))}
            />
          </div>
        ) : null}
        {error ? (
          <div className="mb-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-medium text-violet-soft">
              Blocked by ({blockers.length + missingBlockers.length})
            </div>
            {blockers.length === 0 && missingBlockers.length === 0 ? (
              <div className="mt-1 text-[12px] text-chalk-400">-</div>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {blockers.map((b) => {
                  const open = !isDone(b.status);
                  return (
                    <li key={b.id} className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenTask(b.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-1.5 text-left transition hover:bg-coal-400"
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            open ? "bg-amber-soft" : "bg-emerald-400",
                          )}
                        />
                        <span className="flex-1 truncate text-[12px] text-chalk-100">
                          {b.title}
                        </span>
                        <span className="font-mono text-[10.5px] text-chalk-400">
                          {b.status}
                        </span>
                      </button>
                      <button
                        title="Remove this blocker"
                        disabled={busy}
                        onClick={() =>
                          void setDeps(task.dependencies.filter((d) => d !== b.id))
                        }
                        className="shrink-0 px-1.5 py-1 text-chalk-400 transition hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </button>
                    </li>
                  );
                })}
                {missingBlockers.map((id) => (
                  <li key={id} className="flex items-center gap-1">
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-rose-400/30 bg-rose-500/[0.07] px-2.5 py-1.5 text-[12px] text-rose-300">
                      <span className="flex-1 truncate font-mono">{id}</span>
                      <span className="font-mono text-[10.5px]">missing</span>
                    </span>
                    <button
                      title="Remove this blocker"
                      disabled={busy}
                      onClick={() =>
                        void setDeps(task.dependencies.filter((d) => d !== id))
                      }
                      className="shrink-0 px-1.5 py-1 text-chalk-400 transition hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-[11px] font-medium text-violet-soft">
              Unlocks ({unlocks.length})
            </div>
            {unlocks.length === 0 ? (
              <div className="mt-1 text-[12px] text-chalk-400">-</div>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {unlocks.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => onOpenTask(u.id)}
                      className="flex w-full items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-1.5 text-left transition hover:bg-coal-400"
                    >
                      <span className="flex-1 truncate text-[12px] text-chalk-100">
                        {u.title}
                      </span>
                      <span className="font-mono text-[10.5px] text-chalk-400">
                        {u.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Section>
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
    <section className="rounded-[22px] border border-amber-soft/25 bg-coal-600 p-5">
      <div className="flex items-start gap-2.5">
        <FlaskConical
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-soft"
          strokeWidth={1.9}
        />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-amber-soft">
            Needs testing - a human should check this
          </div>
          <div className="mt-1 text-[12.5px] text-chalk-200">
            {task.needsTestingReason ||
              "A run finished but flagged something for human review (e.g. visual / UX the model can't perceive)."}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => verdict("pass")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-emerald-500/15 px-3 py-1.5 text-[12.5px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {busy === "pass" ? "…" : "Looks good → Done"}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => verdict("fail")}
              disabled={busy !== null}
            >
              {busy === "fail" ? "…" : "Needs work → Reopen"}
            </Button>
          </div>
          {error ? (
            <div className="mt-1.5 text-[11px] text-rose-300">{error}</div>
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
    <Section title="Context sources">
      <div className={CARD}>
        <div className="text-[11.5px] text-chalk-300">
          Files / URLs injected into every agent prompt for this card's runs
          (path-guarded, SSRF-guarded, secrets redacted).
        </div>
        {sources.length > 0 ? (
          <ul className="mt-2.5 space-y-1">
            {sources.map((s, i) => (
              <li
                key={`${s.kind}-${s.ref}-${i}`}
                className="flex items-center gap-2 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-1.5"
              >
                <Chip
                  tone={s.kind === "url" ? "amber" : "neutral"}
                  contained
                  className="shrink-0"
                >
                  {s.kind}
                </Chip>
                {s.kind === "url" ? (
                  <ExternalLink className="h-3 w-3 shrink-0 text-amber-soft" strokeWidth={1.9} />
                ) : (
                  <FileCode className="h-3 w-3 shrink-0 text-chalk-400" strokeWidth={1.9} />
                )}
                <span className="flex-1 truncate font-mono text-[12px] text-chalk-100">
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
                  className="shrink-0 text-chalk-400 transition hover:text-rose-300 disabled:opacity-50"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={add} className="mt-2.5 flex gap-2">
          <Select
            value={kind}
            ariaLabel="Context source kind"
            className="min-w-[110px]"
            onChange={(v) => setKind(v as "file" | "url")}
            options={[
              { value: "file", label: "file" },
              { value: "url", label: "url" },
            ]}
          />
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={kind === "file" ? "path/in/project.md" : "https://…"}
            className={cn(INPUT, "flex-1")}
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={busy || !ref.trim()}
            iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
          >
            Add
          </Button>
        </form>
        {error ? (
          <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {error}
          </div>
        ) : null}
      </div>
    </Section>
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
  const [objective, setObjective] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [fileHintsInput, setFileHintsInput] = useState("");
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
      if (task.runMode === "supervised") {
        const fileHints = fileHintsInput
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);
        await api.addChecklistItem(task.id, t, {
          objective: objective.trim() || undefined,
          acceptanceCheck: acceptance.trim() || undefined,
          fileHints: fileHints.length > 0 ? fileHints : undefined,
        });
        setObjective("");
        setAcceptance("");
        setFileHintsInput("");
      } else {
        await api.addChecklistItem(task.id, t);
      }
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
    if (after.join("") === before.join("")) return;
    void run(`move-${dragId}`, () => api.reorderChecklist(task.id, after));
  }

  return (
    <Section
      title={
        <span className="flex items-center gap-2.5">
          Checklist
          {items.length > 0 ? (
            <>
              <span className="font-mono text-[11px] font-medium tabular-nums text-chalk-300">
                {done}/{items.length}
              </span>
              <span className="h-1 w-24 overflow-hidden rounded-full bg-coal-500">
                <span
                  className="block h-full bg-emerald-400 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </>
          ) : null}
        </span>
      }
      action={
        <button
          type="button"
          onClick={enhance}
          disabled={busy !== null}
          title="Propose a checklist with an AI assist (read-only - you choose whether to add the items)"
          className="inline-flex items-center gap-1 rounded-[10px] bg-violet-soft/10 px-2 py-1 text-[11.5px] font-semibold text-violet-soft transition hover:bg-violet-soft/15 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" strokeWidth={1.9} />
          {busy === "enhance" ? "Thinking…" : "Enhance"}
        </button>
      }
    >
      <div className={CARD}>
        {proposed ? (
          <div className="mb-2.5 rounded-[12px] border border-violet-soft/25 bg-violet-soft/10 p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-violet-soft">
                Proposed ({proposed.length}) - not added yet
              </span>
              <button
                type="button"
                onClick={acceptProposed}
                disabled={busy !== null || proposed.length === 0}
                className="ml-auto rounded-[8px] bg-violet-soft/15 px-2 py-0.5 text-[11px] font-semibold text-violet-soft transition hover:bg-violet-soft/25 disabled:opacity-50"
              >
                {busy === "accept" ? "Adding…" : "Add all"}
              </button>
              <button
                type="button"
                onClick={() => setProposed(null)}
                disabled={busy !== null}
                className="rounded-[8px] bg-coal-600 px-2 py-0.5 text-[11px] text-chalk-300 transition hover:text-chalk-100 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
            <ol className="mt-1.5 space-y-0.5">
              {proposed.map((t, i) => (
                <li key={i} className="text-[12px] text-chalk-100">
                  <span className="font-mono text-chalk-400">{i + 1}.</span> {t}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="text-[12px] text-chalk-400">
            No items yet. Break this card into a concrete ordered checklist below.
          </div>
        ) : (
          <ul className="space-y-1" onDragOver={(e) => e.preventDefault()}>
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                isSaga={task.runMode === "supervised"}
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
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-2">
            <button
              type="button"
              onClick={pickup}
              disabled={busy !== null || pending === 0}
              title="Execute the checklist item-by-item in one run (a commit per item)."
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-violet-soft/15 px-2.5 py-1 text-[12px] font-semibold text-violet-soft transition hover:bg-violet-soft/25 disabled:opacity-50"
            >
              {busy === "pickup"
                ? "Starting…"
                : `Run checklist (${pending} item${pending === 1 ? "" : "s"})`}
            </button>
            <label className="flex items-center gap-1.5 text-[11.5px] text-chalk-300">
              <input
                type="checkbox"
                checked={stepMode}
                onChange={(e) => setStepMode(e.target.checked)}
                className="h-3.5 w-3.5 accent-violet-soft"
              />
              step-by-step
            </label>
            {launched ? (
              <span className="text-[10.5px] text-emerald-400">{launched}</span>
            ) : (
              <span className="ml-auto text-[10.5px] text-chalk-400">
                one worktree · a commit per item · summaries carried forward
              </span>
            )}
          </div>
        ) : null}

        <form onSubmit={add} className="mt-2.5 flex gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a checklist item…"
              className={cn(INPUT, "flex-1")}
            />
            {task.runMode === "supervised" ? (
              <>
                <input
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Objective (optional)…"
                  className={cn(INPUT, "flex-1")}
                />
                <input
                  value={acceptance}
                  onChange={(e) => setAcceptance(e.target.value)}
                  placeholder="Acceptance check (optional)…"
                  className={cn(INPUT, "flex-1")}
                />
                <input
                  value={fileHintsInput}
                  onChange={(e) => setFileHintsInput(e.target.value)}
                  placeholder="File hints (comma-separated, optional)…"
                  className={cn(INPUT, "flex-1")}
                />
              </>
            ) : null}
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={busy === "add" || !text.trim()}
            iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
          >
            {busy === "add" ? "Adding…" : "Add"}
          </Button>
        </form>

        {error ? (
          <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {error}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function ChecklistRow({
  item,
  isSaga,
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
  isSaga: boolean;
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
      ? "text-emerald-400"
      : item.status === "in_progress"
        ? "text-violet-soft"
        : item.status === "blocked"
          ? "text-amber-soft"
          : "text-chalk-400";

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
      className={cn(
        "flex gap-1.5 rounded-[10px] border bg-coal-500 px-2.5 py-1.5 transition",
        isSaga && (item.objective || item.acceptanceCheck || item.fileHints?.length)
          ? "items-start"
          : "items-center",
        dragging
          ? "border-violet-soft/50 opacity-50"
          : dragOver
            ? "border-violet-soft/60 ring-1 ring-violet-soft/40"
            : "border-[color:var(--line-soft)]",
      )}
    >
      <span
        role="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onMouseDown={() => setGrabbed(true)}
        onMouseUp={() => setGrabbed(false)}
        className="shrink-0 cursor-grab text-chalk-400 transition hover:text-chalk-100 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.9} />
      </span>
      <button
        type="button"
        onClick={onToggle}
        disabled={anyBusy}
        title={item.status === "done" ? "Mark pending" : "Mark done"}
        className={cn("shrink-0 text-[14px] leading-none disabled:opacity-50", glyphColor)}
      >
        {checklistGlyph(item.status)}
      </button>
      <div className="min-w-0 flex-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next && next !== item.text) onEdit(next);
            else setDraft(item.text);
          }}
          className={cn(
            "w-full bg-transparent text-[12.5px] focus:outline-none",
            item.status === "done"
              ? "text-chalk-400 line-through"
              : "text-chalk-100",
          )}
        />
        {isSaga && item.objective ? (
          <div className="mt-0.5 text-[10.5px]">
            <span className="font-medium text-violet-soft">objective</span>{" "}
            <span className="text-chalk-300">{item.objective}</span>
          </div>
        ) : null}
        {isSaga && item.acceptanceCheck ? (
          <div className="text-[10.5px]">
            <span className="font-medium text-violet-soft">accept</span>{" "}
            <span className="text-chalk-300">{item.acceptanceCheck}</span>
          </div>
        ) : null}
        {isSaga && item.fileHints?.length ? (
          <div className="text-[10.5px]">
            <span className="font-medium text-violet-soft">files</span>{" "}
            <span className="text-chalk-300">{item.fileHints.join(", ")}</span>
          </div>
        ) : null}
      </div>
      <Select
        value={item.status}
        disabled={anyBusy}
        ariaLabel="Item status"
        className="min-w-[120px] shrink-0"
        onChange={(v) => onStatus(v as ChecklistItemStatus)}
        options={CHECKLIST_STATUSES.map((s) => ({ value: s, label: s }))}
      />
      {item.promotedTaskId ? (
        <button
          type="button"
          onClick={() => onOpenCard(item.promotedTaskId!)}
          title={`Promoted to card ${item.promotedTaskId}`}
          className="shrink-0 text-violet-soft transition hover:text-chalk-100"
        >
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.9} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onPromote}
          disabled={anyBusy}
          title="Promote this item to its own card"
          className="shrink-0 text-chalk-400 transition hover:text-violet-soft disabled:opacity-50"
        >
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.9} />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={anyBusy}
        title="Remove item"
        className="shrink-0 text-chalk-400 transition hover:text-rose-300 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
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
    <Section title="Files">
      <div className={CARD}>
        {task.touchedFiles.length > 0 ? (
          <div>
            <div className="text-[11px] font-medium text-violet-soft">
              Declared (touchedFiles)
            </div>
            <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
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
            <div className="text-[11px] font-medium text-violet-soft">
              Changed by linked runs
            </div>
            <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
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
      </div>
    </Section>
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
      className={cn(
        "flex w-full items-center gap-1.5 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500 px-2.5 py-1.5 text-left text-[11.5px] transition",
        redacted
          ? "text-amber-soft opacity-80"
          : "text-chalk-300 hover:border-violet-soft/40 hover:text-chalk-100",
      )}
      title={redacted ? "Secret file - contents redacted" : path}
    >
      {redacted ? (
        <Lock className="h-3 w-3 shrink-0" strokeWidth={1.9} />
      ) : (
        <FileCode className="h-3 w-3 shrink-0" strokeWidth={1.9} />
      )}
      <span className="truncate font-mono">{path}</span>
      {status ? (
        <span className="ml-auto font-mono text-[10px] text-chalk-400">
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

  async function setField<K extends "profileOverride" | "readOnly">(
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
      // Cast through the patch shape - the api method accepts a partial
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

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 rounded-[14px] border border-[color:var(--line)] bg-coal-600 p-3 md:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span
          className="text-[11px] font-medium text-violet-soft"
          title="Pin every agent in runs spawned from this task to a specific provider id. Wins over effort."
        >
          Provider override
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
          className={cn(INPUT, "font-mono text-[12px]")}
        />
      </label>

      <label className="flex items-center gap-2 self-end">
        <input
          type="checkbox"
          checked={task.readOnly ?? false}
          disabled={busy !== null}
          onChange={(e) => void setField("readOnly", e.target.checked)}
          className="h-3.5 w-3.5 accent-violet-soft"
        />
        <span
          className="text-[12px] font-medium text-chalk-200"
          title="Investigation-only: runs spawned from this task skip executor + fix loop and refuse apply/validate/revert."
        >
          Read-only
        </span>
      </label>

      {error ? (
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300 md:col-span-3">
          {error}
        </div>
      ) : null}
    </div>
  );
}
