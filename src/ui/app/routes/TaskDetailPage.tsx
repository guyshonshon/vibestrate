import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  ExternalLink,
  FileCode,
  FlaskConical,
  GripVertical,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { reorderByDrop } from "../../lib/reorder.js";
import { navigate } from "../App.js";
import type {
  ChangedFile,
  ChecklistItem,
  ChecklistItemStatus,
  MicroStep,
  ProfileView,
  RoadmapItem,
  Task,
  TaskComment,
} from "../../lib/types.js";
import { MicroStepPipeline } from "../../components/board/MicroStepPipeline.js";
import { TaskGitActivity } from "../../components/tasks/TaskGitActivity.js";
import { StepDetailDrawer } from "../../components/tasks/StepDetailDrawer.js";
import { TaskOverviewPanel } from "../../components/tasks/TaskOverviewPanel.js";
import { Breadcrumbs } from "../../components/layout/Breadcrumbs.js";
import { Select } from "../../components/design/Select.js";
import { Button } from "../../components/design/Button.js";
import { Chip, type ChipTone } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { ConductorPanel } from "../../components/saga/ConductorPanel.js";

// Shared input recipe (contract §6, BoardPage idiom).
const INPUT =
  "rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none";

// A titled, contained card body for sections that aren't a full Section title.
const CARD = "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4";

// Priority / risk read as coloured attributes (not metrics): low is quiet,
// medium is the accent, high is attention.
const ATTR_TONE: Record<Task["priority"], string> = {
  low: "text-chalk-300",
  medium: "text-violet-soft",
  high: "text-amber-soft",
};

// One row in the sidebar Details card: a muted label, a coloured value.
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line-soft)] py-[7px] text-[12px] last:border-0">
      <span className="shrink-0 text-chalk-400">{label}</span>
      <span className="truncate text-right font-medium text-chalk-100">{children}</span>
    </div>
  );
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
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");

  async function load() {
    try {
      const [r, list, rm] = await Promise.all([
        api.getTask(taskId),
        api.listTasks(),
        api.listRoadmap().catch(() => [] as RoadmapItem[]),
      ]);
      setData(r);
      setAllTasks(list);
      setRoadmap(rm);
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
  // Step-scoped comments live in the step detail drawer, not the task-level list.
  const taskComments = comments.filter((c) => c.target !== "step");
  const open = taskComments.filter((c) => !c.resolved);
  const resolved = taskComments.filter((c) => c.resolved);
  const queueDisabled =
    busy !== null || task.status === "queued" || task.status === "running";
  const roadmapTitle = task.roadmapItemId
    ? (roadmap.find((r) => r.id === task.roadmapItemId)?.title ?? null)
    : null;

  return (
    <PageShell>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Board", onClick: () => navigate({ kind: "board" }) },
          ...(roadmapTitle ? [{ label: roadmapTitle, muted: true } as const] : []),
          { label: task.title },
        ]}
      />
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            {task.title}
            <span className="font-mono text-[12px] font-medium text-chalk-400">
              {task.id}
            </span>
          </span>
        }
      />

      <div className="mb-4">
        <TaskOverviewPanel
          task={task}
          stepsDone={(task.checklist ?? []).filter((i) => i.status === "done").length}
          stepsTotal={(task.checklist ?? []).length}
          runsCount={task.runIds.length}
          busy={busy}
          queueDisabled={queueDisabled}
          onStart={queue}
          onCancel={cancel}
          onArchive={() => toggleArchive(!task.archived)}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* ── Main column: what you work on ───────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          {task.needsTesting ? (
            <NeedsTestingBanner task={task} onResolved={load} />
          ) : null}
          {/* Brief: the task's description and its grounding (context) as one
              block - references belong to the brief, not a standalone card. */}
          <Section title="Brief">
            <div className={CARD}>
              {task.description ? (
                <div className="whitespace-pre-wrap text-[12.5px] text-chalk-200">
                  {task.description}
                </div>
              ) : (
                <div className="text-[12px] text-chalk-400">
                  No description yet - the brief grounds what the supervisor plans.
                </div>
              )}
              <div className="mt-3 border-t border-[color:var(--line-soft)] pt-3">
                <ContextSourcesSection task={task} onChanged={load} />
              </div>
            </div>
          </Section>

          {task.acceptanceCriteria ? (
            <Section title="Acceptance criteria">
              <div className={CARD}>
                <div className="whitespace-pre-wrap text-[12.5px] text-chalk-200">
                  {task.acceptanceCriteria}
                </div>
              </div>
            </Section>
          ) : null}

          {task.runMode === "supervised" ? <ConductorPanel taskId={task.id} /> : null}

          <ChecklistSection
            task={task}
            comments={comments}
            onChanged={load}
            onOpenTask={onOpenTask}
            onOpenRun={onOpenRun}
          />

          <Section title="Runs">
            <div className={CARD}>
              {task.runIds.length === 0 ? (
                <div className="text-[12px] text-chalk-400">
                  No runs yet. Use <span className="font-medium text-chalk-200">Start task</span> at
                  the top to kick one off - runs show up here.
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {task.runIds.map((rid) => {
                    const steps =
                      microSteps.find((m) => m.runId === rid)?.steps ?? [];
                    return (
                      <li
                        key={rid}
                        className="rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500/50 px-3 py-2"
                      >
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
                        {steps.length > 0 ? (
                          <div className="mt-2">
                            <MicroStepPipeline runId={rid} steps={steps} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Section>

          <TaskGitActivity
            runIds={task.runIds}
            onOpenRun={onOpenRun}
            onOpenGit={(rid) => navigate({ kind: "git", runId: rid })}
          />

          <FilesSection task={task} />

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

        {/* ── Sidebar: metadata + settings ────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0">
          <Section title="Details">
            <div className={CARD}>
              <DetailRow label="Priority">
                <span className={ATTR_TONE[task.priority]}>{task.priority}</span>
              </DetailRow>
              <DetailRow label="Risk">
                <span className={ATTR_TONE[task.riskLevel]}>{task.riskLevel}</span>
              </DetailRow>
              {task.est ? (
                <DetailRow label="Estimate">
                  <span className="text-chalk-300">{task.est}</span>
                </DetailRow>
              ) : null}
              <DetailRow label="Roadmap">
                {roadmapTitle ? (
                  <span className="text-sky-glow">{roadmapTitle}</span>
                ) : (
                  <span className="text-chalk-400">-</span>
                )}
              </DetailRow>
              <DetailRow label="Provider">
                <span className={task.profileOverride ? "text-violet-soft" : "text-chalk-400"}>
                  {task.profileOverride ?? "default"}
                </span>
              </DetailRow>
              <DetailRow label="Read-only">
                {task.readOnly ? (
                  <span className="inline-flex items-center gap-1 text-amber-soft">
                    <Lock className="h-2.5 w-2.5" strokeWidth={1.9} /> yes
                  </span>
                ) : (
                  <span className="text-chalk-400">no</span>
                )}
              </DetailRow>
              {task.derivedFrom ? (
                <DetailRow label="Derived from">
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.derivedFrom!.taskId)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-violet-soft transition hover:text-violet-soft/80"
                    title="Promoted from a checklist item on another card."
                  >
                    <ArrowUpRight className="h-3 w-3" strokeWidth={1.9} />
                    {task.derivedFrom.taskId}
                  </button>
                </DetailRow>
              ) : null}
            </div>
          </Section>

          <Section title="Run settings">
            <TaskRunMode
              task={task}
              onPatched={(next) => setData((d) => (d ? { ...d, task: next } : d))}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-chalk-300">
              Run from CLI:
              <code className="break-all rounded-[7px] bg-coal-500 px-1.5 py-0.5 font-mono text-[11px] text-chalk-200">
                vibe tasks run {task.id}
              </code>
            </div>
          </Section>

          <DependenciesSection
            task={task}
            allTasks={allTasks}
            onOpenTask={onOpenTask}
            onChanged={load}
          />
        </div>
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
      title="Blockers"
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
        <div className="mb-2.5 text-[11px] text-chalk-400">
          What must finish before this can run, and what finishing this unblocks.
        </div>
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
              <div className="mt-1.5 flex flex-col items-start gap-1.5">
                <div className="text-[12px] text-emerald-400">
                  Nothing's blocking this - it can run.
                </div>
                {candidates.length > 0 ? (
                  <button
                    onClick={() => {
                      setError(null);
                      setAdding(true);
                    }}
                    className="text-[11.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80"
                  >
                    + Add a blocker
                  </button>
                ) : null}
              </div>
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
              <div className="mt-1.5 text-[12px] text-chalk-400">
                Nothing's waiting on this one yet.
              </div>
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
  const [adding, setAdding] = useState(false);
  const hasSources = sources.length > 0;

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

  // Embedded grounding row - lives inside the Brief card, not a standalone
  // section. A compact "Grounding" label, the sources as inline chips, and an
  // add affordance that reveals the file/url input only when opted in.
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[11px] font-medium text-violet-soft">Grounding</span>
        {hasSources ? (
          sources.map((s, i) => (
            <span
              key={`${s.kind}-${s.ref}-${i}`}
              className="group inline-flex items-center gap-1.5 rounded-[8px] bg-coal-500/70 py-1 pl-2 pr-1.5 text-[11px]"
            >
              {s.kind === "url" ? (
                <ExternalLink className="h-3 w-3 shrink-0 text-amber-soft" strokeWidth={1.9} />
              ) : (
                <FileCode className="h-3 w-3 shrink-0 text-violet-soft" strokeWidth={1.9} />
              )}
              <span className="max-w-[220px] truncate font-mono text-chalk-200">{s.ref}</span>
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
                title="Remove reference"
                className="shrink-0 text-chalk-500 transition hover:text-rose-300 disabled:opacity-50"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ))
        ) : (
          <span className="text-[11px] text-chalk-400">none</span>
        )}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-chalk-300 transition hover:text-violet-soft"
          >
            <Plus className="h-3 w-3" strokeWidth={1.9} /> Add
          </button>
        ) : null}
      </div>

      {adding ? (
        <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-[10px] border border-[color:var(--line)] bg-coal-800 p-0.5">
            {(["file", "url"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-[8px] px-2.5 py-1 text-[12px] font-semibold capitalize transition",
                  kind === k
                    ? "bg-coal-600 text-chalk-100"
                    : "text-chalk-400 hover:text-chalk-200",
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={kind === "file" ? "path/in/project.md" : "https://…"}
            autoFocus
            className={cn(INPUT, "min-w-[180px] flex-1")}
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={busy || !ref.trim()}
            iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
          >
            Add
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Done
          </Button>
        </form>
      ) : null}
      {adding ? (
        <p className="mt-1.5 text-[10.5px] text-chalk-400">
          Files or URLs injected into every run (path-guarded, SSRF-guarded,
          secrets redacted).
        </p>
      ) : null}
      {error ? (
        <div className="mt-1.5 text-[11px] text-rose-300">{error}</div>
      ) : null}
    </div>
  );
}

function ChecklistSection({
  task,
  comments,
  onChanged,
  onOpenTask,
  onOpenRun,
}: {
  task: Task;
  comments: TaskComment[];
  onChanged: () => Promise<void> | void;
  onOpenTask: (taskId: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const items = task.checklist ?? [];
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const openStep = openStepId
    ? (items.find((i) => i.id === openStepId) ?? null)
    : null;
  const [text, setText] = useState("");
  const [objective, setObjective] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [fileHintsInput, setFileHintsInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [proposed, setProposed] = useState<string[] | null>(null);
  const [planQ, setPlanQ] = useState<{
    questions: {
      id: string;
      question: string;
      why: string;
      kind: "choice" | "text";
      options: string[];
    }[];
    answers: Record<string, string>;
  } | null>(null);
  const [stepMode, setStepMode] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);
  // Manual step authoring is the escape hatch, not the default - the supervisor
  // plans the breakdown. The form stays hidden until the user opts into it.
  const [manualAdd, setManualAdd] = useState(false);
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

  // Enhance is a toggle: while it's thinking, clicking again aborts it. The
  // abort cancels the in-flight request (the client stops waiting and discards
  // any result); it does not claim to halt server-side compute.
  const enhanceCtl = useRef<AbortController | null>(null);
  async function enhance(answers?: { question: string; answer: string }[]) {
    if (busy === "enhance") {
      enhanceCtl.current?.abort();
      return;
    }
    setProposed(null);
    const ctl = new AbortController();
    enhanceCtl.current = ctl;
    setBusy("enhance");
    setError(null);
    try {
      const r = await api.enhanceChecklist(task.id, {
        apply: false,
        answers,
        signal: ctl.signal,
      });
      setProposed(r.proposal.items);
      await onChanged();
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
      enhanceCtl.current = null;
    }
  }

  // Guided plan: ask a bounded round of clarifying questions first, then break
  // down using the answers. If the model has nothing to ask, go straight to the
  // breakdown (seamless).
  const planCtl = useRef<AbortController | null>(null);
  async function startPlan() {
    if (busy === "plan") {
      planCtl.current?.abort();
      return;
    }
    setProposed(null);
    setPlanQ(null);
    const ctl = new AbortController();
    planCtl.current = ctl;
    setBusy("plan");
    setError(null);
    try {
      const r = await api.planQuestions(task.id, { signal: ctl.signal });
      if (r.proposal.questions.length === 0) {
        setBusy(null);
        planCtl.current = null;
        await enhance();
        return;
      }
      setPlanQ({ questions: r.proposal.questions, answers: {} });
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy((b) => (b === "plan" ? null : b));
      planCtl.current = null;
    }
  }

  async function buildFromAnswers() {
    const pq = planQ;
    if (!pq) return;
    const answers = pq.questions
      .map((q) => ({ question: q.question, answer: (pq.answers[q.id] ?? "").trim() }))
      .filter((a) => a.answer.length > 0);
    setPlanQ(null);
    await enhance(answers.length > 0 ? answers : undefined);
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
    <>
    {openStep ? (
      <StepDetailDrawer
        task={task}
        item={openStep}
        comments={comments}
        onClose={() => setOpenStepId(null)}
        onChanged={onChanged}
        onOpenRun={onOpenRun}
        onPromote={() => {
          // Already detached: navigate to the card. Else detach it now.
          if (openStep.promotedTaskId) {
            onOpenTask(openStep.promotedTaskId);
            return;
          }
          void run(`p-${openStep.id}`, () =>
            api.promoteChecklistItem(task.id, openStep.id),
          );
        }}
      />
    ) : null}
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
          onClick={() => enhance()}
          disabled={busy !== null && busy !== "enhance"}
          title={
            busy === "enhance"
              ? "Thinking… click to abort"
              : "Propose a checklist with an AI assist (read-only - you choose whether to add the items)"
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11.5px] font-semibold transition disabled:opacity-50",
            busy === "enhance"
              ? "bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
              : "bg-violet-soft/10 text-violet-soft hover:bg-violet-soft/15",
          )}
        >
          {busy === "enhance" ? (
            <X className="h-3 w-3" strokeWidth={1.9} />
          ) : (
            <Sparkles className="h-3 w-3" strokeWidth={1.9} />
          )}
          {busy === "enhance" ? "Abort" : "Enhance"}
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

        {/* Guided plan: the clarifying-questions round before the breakdown. */}
        {planQ ? (
          <div className="mb-2.5 rounded-[12px] border border-violet-soft/25 bg-violet-soft/[0.06] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
              <span className="text-[12px] font-semibold text-chalk-100">
                A few questions before I break this down
              </span>
              <span className="text-[10.5px] text-chalk-400">
                answer what you can - skip the rest
              </span>
            </div>
            <div className="space-y-2.5">
              {planQ.questions.map((q) => (
                <div key={q.id}>
                  <div className="text-[12px] font-medium text-chalk-100">{q.question}</div>
                  {q.why ? (
                    <div className="text-[10.5px] text-chalk-400">{q.why}</div>
                  ) : null}
                  {q.kind === "choice" && q.options.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {q.options.map((opt) => {
                        const active = planQ.answers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setPlanQ((p) =>
                                p
                                  ? {
                                      ...p,
                                      answers: {
                                        ...p.answers,
                                        [q.id]: active ? "" : opt,
                                      },
                                    }
                                  : p,
                              )
                            }
                            className={cn(
                              "rounded-[9px] border px-2.5 py-1 text-[11.5px] transition",
                              active
                                ? "border-violet-soft/50 bg-violet-soft/15 text-violet-soft"
                                : "border-[color:var(--line-soft)] bg-coal-500 text-chalk-300 hover:text-chalk-100",
                            )}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      value={planQ.answers[q.id] ?? ""}
                      onChange={(e) =>
                        setPlanQ((p) =>
                          p
                            ? { ...p, answers: { ...p.answers, [q.id]: e.target.value } }
                            : p,
                        )
                      }
                      placeholder="Your answer…"
                      className={cn(INPUT, "mt-1.5 w-full")}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={buildFromAnswers}
                disabled={busy !== null}
                iconLeft={<Sparkles className="h-3 w-3" strokeWidth={1.9} />}
              >
                Build the steps
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPlanQ(null);
                  void enhance();
                }}
                disabled={busy !== null}
              >
                Skip, just break it down
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setPlanQ(null)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {items.length === 0 && !proposed && !planQ && !manualAdd ? (
          <div className="flex flex-col items-start gap-2.5 rounded-[12px] border border-violet-soft/25 bg-violet-soft/[0.06] px-4 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-soft" strokeWidth={1.9} />
              <span className="text-[13px] font-semibold text-chalk-100">
                Let the supervisor plan this
              </span>
            </div>
            <p className="max-w-[46ch] text-[12px] leading-relaxed text-chalk-300">
              Describe what you want in the task above (and any references). The
              supervisor asks a couple of clarifying questions, then breaks it into
              an ordered set of steps you can review, reorder and run - you don't
              have to write every step by hand.
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={startPlan}
                disabled={busy !== null && busy !== "plan"}
                iconLeft={
                  busy === "plan" ? (
                    <X className="h-3 w-3" strokeWidth={1.9} />
                  ) : (
                    <Sparkles className="h-3 w-3" strokeWidth={1.9} />
                  )
                }
              >
                {busy === "plan" ? "Thinking… abort" : "Plan the steps"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManualAdd(true)}
                iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
              >
                Add manually
              </Button>
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
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
                onRemove={() =>
                  run(`r-${item.id}`, () =>
                    api.removeChecklistItem(task.id, item.id),
                  )
                }
                onOpen={() => setOpenStepId(item.id)}
              />
            ))}
          </ul>
        ) : null}

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

        {/* Manual authoring is the escape hatch: a reveal button when steps
            exist, the form itself only when opted in. */}
        {items.length > 0 && !manualAdd ? (
          <button
            type="button"
            onClick={() => setManualAdd(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-chalk-300 transition hover:text-chalk-100"
          >
            <Plus className="h-3 w-3" strokeWidth={1.9} /> Add a step manually
          </button>
        ) : null}

        {manualAdd ? (
          <form onSubmit={add} className="mt-2.5 flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Step title…"
                autoFocus
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
            <div className="flex flex-col gap-1.5">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={busy === "add" || !text.trim()}
                iconLeft={<Plus className="h-3 w-3" strokeWidth={1.9} />}
              >
                {busy === "add" ? "Adding…" : "Add"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setManualAdd(false)}
              >
                Done
              </Button>
            </div>
          </form>
        ) : null}

        {error ? (
          <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
            {error}
          </div>
        ) : null}
      </div>
    </Section>
    </>
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
  onRemove,
  onOpen,
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
  onRemove: () => void;
  onOpen: () => void;
}) {
  // Drag is initiated only from the grip handle. We flip the row's draggable
  // flag on grip mousedown.
  const [grabbed, setGrabbed] = useState(false);
  const anyBusy = busy !== null;
  const done = item.status === "done";
  // Status beyond the done-check is RUN-DERIVED (the run drives in_progress /
  // blocked); it is shown read-only, never as an editable control.
  const runState =
    item.status === "in_progress"
      ? { label: "running", tone: "text-violet-soft" }
      : item.status === "blocked"
        ? { label: "blocked", tone: "text-amber-soft" }
        : null;
  const hasDetail = !!(
    isSaga &&
    (item.objective || item.acceptanceCheck || item.fileHints?.length)
  );

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
      onClick={onOpen}
      role="button"
      title="Open this step"
      className={cn(
        "group flex cursor-pointer gap-2 rounded-[10px] border bg-coal-500 px-2.5 py-2 transition hover:border-violet-soft/40 hover:bg-coal-500/70",
        hasDetail ? "items-start" : "items-center",
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
        onClick={(e) => e.stopPropagation()}
        onMouseDown={() => setGrabbed(true)}
        onMouseUp={() => setGrabbed(false)}
        className={cn(
          "shrink-0 cursor-grab text-chalk-500 opacity-0 transition hover:text-chalk-200 active:cursor-grabbing group-hover:opacity-100",
          hasDetail && "mt-0.5",
        )}
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.9} />
      </span>
      {/* Done-check: a real V checkbox, the only manual status transition. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={anyBusy}
        aria-pressed={done}
        title={done ? "Mark not done" : "Mark done"}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition disabled:opacity-50",
          hasDetail && "mt-0.5",
          done
            ? "border-emerald-400 bg-emerald-400 text-coal-900"
            : "border-[color:var(--line-strong)] text-transparent hover:border-emerald-400/60",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={2.6} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-[12.5px]",
              done ? "text-chalk-400 line-through" : "text-chalk-100",
            )}
          >
            {item.text}
          </span>
          {runState ? (
            <span className={cn("shrink-0 font-mono text-[10px]", runState.tone)}>
              {runState.label}
            </span>
          ) : null}
          {item.promotedTaskId ? (
            <span className="shrink-0 font-mono text-[10px] text-chalk-400">
              detached
            </span>
          ) : null}
        </div>
        {isSaga && item.objective ? (
          <div className="mt-0.5 truncate text-[10.5px]">
            <span className="font-medium text-violet-soft">objective</span>{" "}
            <span className="text-chalk-300">{item.objective}</span>
          </div>
        ) : null}
        {isSaga && item.acceptanceCheck ? (
          <div className="truncate text-[10.5px]">
            <span className="font-medium text-violet-soft">accept</span>{" "}
            <span className="text-chalk-300">{item.acceptanceCheck}</span>
          </div>
        ) : null}
        {isSaga && item.fileHints?.length ? (
          <div className="truncate text-[10.5px]">
            <span className="font-medium text-violet-soft">files</span>{" "}
            <span className="text-chalk-300">{item.fileHints.join(", ")}</span>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={anyBusy}
        title="Remove step"
        className={cn(
          "shrink-0 text-chalk-500 opacity-0 transition hover:text-rose-300 disabled:opacity-50 group-hover:opacity-100",
          hasDetail && "mt-0.5",
        )}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
      </button>
      {/* Prominent "configure this step" affordance. */}
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 text-chalk-500 transition group-hover:text-violet-soft",
          hasDetail && "mt-0.5",
        )}
        strokeWidth={2}
        aria-hidden
      />
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
  const [profiles, setProfiles] = useState<ProfileView[]>([]);

  useEffect(() => {
    api
      .getProfiles()
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, []);

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

  const providerOptions = [
    { value: "", label: "Default (crew's provider)" },
    ...profiles.map((p) => ({
      value: p.id,
      label: p.label,
      hint: p.model ?? p.provider,
    })),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-[color:var(--line)] bg-coal-600 p-3">
      <label className="flex flex-col gap-1.5">
        <span
          className="text-[11px] font-medium text-violet-soft"
          title="Pin every agent in runs spawned from this task to a specific configured profile. Wins over effort."
        >
          Provider
        </span>
        <Select
          value={task.profileOverride ?? ""}
          disabled={busy !== null}
          ariaLabel="Provider override"
          className="w-full"
          options={providerOptions}
          onChange={(v) => {
            if (v === (task.profileOverride ?? "")) return;
            void setField("profileOverride", v.length === 0 ? null : v);
          }}
        />
      </label>

      <label className="flex items-center gap-2">
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
        <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
