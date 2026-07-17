import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, ExternalLink, Lock } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import { navigate } from "../App.js";
import type {
  MicroStep,
  RoadmapItem,
  Task,
  TaskComment,
} from "../../lib/types.js";
import { MicroStepPipeline } from "../../components/board/MicroStepPipeline.js";
import { TaskGitActivity } from "../../components/tasks/TaskGitActivity.js";
import { TaskOverviewPanel } from "../../components/tasks/TaskOverviewPanel.js";
import { ChecklistSection } from "../../components/tasks/ChecklistSection.js";
import { ContextSourcesSection } from "../../components/tasks/ContextSourcesSection.js";
import { DependenciesSection } from "../../components/tasks/DependenciesSection.js";
import { FilesSection } from "../../components/tasks/FilesSection.js";
import { NeedsTestingBanner } from "../../components/tasks/NeedsTestingBanner.js";
import { TaskRunMode } from "../../components/tasks/TaskRunMode.js";
import { CARD, INPUT } from "../../components/tasks/sectionChrome.js";
import { Breadcrumbs } from "../../components/layout/Breadcrumbs.js";
import { Button } from "../../components/design/Button.js";
import { Chip } from "../../components/design/Chip.js";
import { cn } from "../../components/design/cn.js";
import { PageShell, PageHeader, Section } from "../../components/layout/PageShell.js";
import { ConductorPanel } from "../../components/saga/ConductorPanel.js";

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
        <ErrorView
          err={error}
          onRetry={() => void load()}
          actions={[
            { label: "Back to board", onClick: () => navigate({ kind: "board" }) },
          ]}
        />
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
