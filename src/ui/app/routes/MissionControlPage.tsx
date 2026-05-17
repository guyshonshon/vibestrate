import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { streamAllEvents } from "../../lib/aggregateEvents.js";
import { deriveSchedulerLiveness } from "../../lib/schedulerLiveness.js";
import {
  ContextMenuTrigger,
  type ContextMenuItem,
} from "../../components/ContextMenu.js";
import { AttentionBar } from "../../components/AttentionBar.js";
import { push as pushDesktop } from "../../lib/desktopNotify.js";
import type {
  AmacoEvent,
  ApprovalRequest,
  NotificationRecord,
  QueueEntry,
  ReviewSuggestion,
  RunState,
  RunStatus,
  SchedulerState,
  Task,
} from "../../lib/types.js";

type ApprovalRow = ApprovalRequest & { runId: string };
type SuggestionRow = ReviewSuggestion & { runId: string };

type Props = {
  onSelectRun: (runId: string) => void;
  onShowRoadmap: () => void;
  onShowQueue: () => void;
  onOpenTask: (taskId: string) => void;
};

const STATUS_TONE: Record<string, string> = {
  planning: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  architecting: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  executing:
    "bg-amaco-accent/10 text-amaco-accent border-amaco-accent/30",
  validating: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  reviewing: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  fixing: "bg-amaco-accent/10 text-amaco-accent border-amaco-accent/30",
  verifying: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  paused: "bg-amaco-warn/10 text-amaco-warn border-amaco-warn/30",
  waiting_for_approval:
    "bg-amaco-warn/10 text-amaco-warn border-amaco-warn/30",
  merge_ready:
    "bg-amaco-success/10 text-amaco-success border-amaco-success/30",
  blocked: "bg-amaco-fail/10 text-amaco-fail border-amaco-fail/30",
  failed: "bg-amaco-fail/10 text-amaco-fail border-amaco-fail/30",
  aborted: "bg-amaco-fail/10 text-amaco-fail border-amaco-fail/30",
};

/** Canonical workflow phases the orchestrator walks through. */
const WORKFLOW_STEPS = [
  { key: "plan", label: "Plan", statuses: ["planning", "planned"] },
  { key: "arch", label: "Arch", statuses: ["architecting", "architected"] },
  { key: "exec", label: "Exec", statuses: ["executing"] },
  { key: "val", label: "Val", statuses: ["validating"] },
  { key: "review", label: "Review", statuses: ["reviewing"] },
  { key: "fix", label: "Fix", statuses: ["fixing"] },
  { key: "verify", label: "Verify", statuses: ["verifying"] },
  { key: "ready", label: "Ready", statuses: ["merge_ready"] },
] as const;

function isActive(s: RunStatus): boolean {
  return ![
    "merge_ready",
    "failed",
    "aborted",
    "blocked",
  ].includes(s);
}

function relTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = Math.max(0, now - t);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Compute a step-index for the current status. Steps the run has
 * already passed render as "done" (green tick); the current step is
 * pulsing cyan; later steps are dim.
 */
function currentStepIndex(status: RunStatus): number {
  for (let i = 0; i < WORKFLOW_STEPS.length; i += 1) {
    const step = WORKFLOW_STEPS[i]!;
    if (step.statuses.some((s) => s === status)) return i;
  }
  // Terminal / off-path statuses (paused, approval, blocked, failed,
  // aborted) — mark the last reached step by the run state's
  // pausedAtStatus when available, otherwise leave as -1 ("unknown").
  if (status === "paused" || status === "waiting_for_approval") return -1;
  return -1;
}

/**
 * Walk an events tail to derive what's *currently* attached: the
 * agent the orchestrator most recently started without a matching
 * completed / failed, plus its provider and MCP servers.
 */
function deriveLive(events: AmacoEvent[]): {
  currentAgent: string | null;
  currentProvider: string | null;
  currentMcp: string[];
  lastEvent: AmacoEvent | null;
} {
  let agent: string | null = null;
  let provider: string | null = null;
  let mcp: string[] = [];
  for (const ev of events) {
    const agentId =
      ev.data && typeof ev.data.agentId === "string"
        ? (ev.data.agentId as string)
        : null;
    if (ev.type === "agent.started" && agentId) {
      agent = agentId;
      provider =
        ev.data && typeof ev.data.provider === "string"
          ? (ev.data.provider as string)
          : null;
      mcp = [];
    } else if (
      (ev.type === "agent.completed" || ev.type === "agent.failed") &&
      agentId === agent
    ) {
      agent = null;
      provider = null;
      mcp = [];
    } else if (
      ev.type === "mcp.attached" &&
      agentId === agent &&
      Array.isArray(ev.data?.servers)
    ) {
      const servers = ev.data!.servers as Array<{ name?: unknown }>;
      mcp = servers
        .map((s) => (typeof s.name === "string" ? s.name : null))
        .filter((n): n is string => !!n);
    }
  }
  return {
    currentAgent: agent,
    currentProvider: provider,
    currentMcp: mcp,
    lastEvent: events.length > 0 ? events[events.length - 1] ?? null : null,
  };
}

export function MissionControlPage({
  onSelectRun,
  onShowRoadmap,
  onShowQueue,
  onOpenTask,
}: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [eventsByRun, setEventsByRun] = useState<Record<string, AmacoEvent[]>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTask, setComposerTask] = useState("");
  const [composerEffort, setComposerEffort] = useState<"" | "low" | "medium" | "high">("");
  const [composerReadOnly, setComposerReadOnly] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);
  // Quick-create task form (left rail).
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">(
    "medium",
  );
  const [newTaskBusy, setNewTaskBusy] = useState(false);
  // Right-rail inbox: aggregated pending approvals / open suggestions /
  // recent notifications.
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  // Issues stream (failures captured from anywhere — server routes,
  // spawn errors, panel actions). Used by the header badge so the
  // user can never miss a failure.
  type IssueRow = Awaited<ReturnType<typeof api.listIssues>>["issues"][number];
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  // Ref to the right-rail inbox so AttentionBar's "Open inbox →"
  // can scroll it into view (and pop the issues panel on narrow
  // screens where the rail is hidden).
  const inboxRef = useRef<HTMLElement | null>(null);
  const focusInbox = (): void => {
    if (inboxRef.current) {
      inboxRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setIssuesOpen(true);
    }
  };

  // Auto-dismiss the toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const [r, t, q] = await Promise.all([
          api.listRuns(),
          api.listTasks(),
          api.getQueue().catch(() => ({ queue: [], state: null as SchedulerState | null })),
        ]);
        if (cancelled) return;
        setRuns(r);
        setTasks(t);
        setQueue(q.queue);
        setScheduler(q.state);
        setError(null);
        // Best-effort: read the recent events for each *active* run so
        // the inline panel can show the current agent / MCP / phase.
        // We do this on the same poll tick to keep complexity low.
        const active = r.filter((x) => isActive(x.status));
        const byRun: Record<string, AmacoEvent[]> = {};
        // Approvals + suggestions are sparse — walk every non-terminal
        // run, but skip terminal ones to keep the fan-out reasonable.
        const aprAggregate: ApprovalRow[] = [];
        const sugAggregate: SuggestionRow[] = [];
        await Promise.all(
          r.map(async (run) => {
            const isLive = isActive(run.status);
            const promises: Promise<unknown>[] = [];
            if (isLive) {
              promises.push(
                api
                  .listEvents(run.runId)
                  .then((evs) => {
                    byRun[run.runId] = evs.slice(-50);
                  })
                  .catch(() => {
                    byRun[run.runId] = [];
                  }),
              );
            }
            promises.push(
              api
                .listApprovals(run.runId)
                .then((list) => {
                  for (const a of list) {
                    if (a.status === "pending") {
                      aprAggregate.push({ ...a, runId: run.runId });
                    }
                  }
                })
                .catch(() => undefined),
            );
            promises.push(
              api
                .listSuggestions(run.runId)
                .then((list) => {
                  for (const s of list) {
                    if (s.status === "open") {
                      sugAggregate.push({ ...s, runId: run.runId });
                    }
                  }
                })
                .catch(() => undefined),
            );
            await Promise.all(promises);
          }),
        );
        const notif = await api.listNotifications().catch(() => ({
          notifications: [] as NotificationRecord[],
          unread: 0,
        }));
        if (cancelled) return;
        setEventsByRun(byRun);
        aprAggregate.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        sugAggregate.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        setApprovals(aprAggregate);
        setSuggestions(sugAggregate);
        setNotifications(notif.notifications);
        const issuesResp = await api
          .listIssues()
          .catch(() => ({ issues: [], unresolved: 0 }));
        if (!cancelled) setIssues(issuesResp.issues);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Aggregate SSE for live deltas. We still keep the 2s poll as a
  // safety net so the page stays correct even if the connection
  // drops; SSE just shaves the latency from ~2s to ~realtime for
  // event-driven updates (new event lines, run status flips,
  // approval / suggestion creates).
  const refreshFlagRef = useRef(false);
  useEffect(() => {
    const disconnect = streamAllEvents({
      onEvent: ({ runId, event }) => {
        // Loud-by-default: when something needs the user's attention,
        // fire a deduped desktop notification (no-op if the user
        // hasn't granted permission yet — the AttentionBar nudges
        // them to enable it).
        if (event.type === "approval.requested") {
          const apId =
            (event.data as { approvalId?: string } | undefined)?.approvalId ??
            runId;
          pushDesktop({
            kind: "approval-requested",
            id: apId,
            title: "Approval requested",
            body: `Run ${runId} needs you to approve before it can continue.`,
            onClick: () => onSelectRun(runId),
          });
        } else if (
          event.type === "run.failed" ||
          event.type === "run.aborted"
        ) {
          pushDesktop({
            kind: "run-failed",
            id: runId,
            title:
              event.type === "run.failed" ? "Run failed" : "Run aborted",
            body: event.message ?? `Run ${runId} stopped.`,
            onClick: () => onSelectRun(runId),
          });
        }
        setEventsByRun((prev) => {
          const cur = prev[runId] ?? [];
          // Cap each run's tail at 50 lines to match the polled
          // loader and keep render lean.
          const next = [...cur, event].slice(-50);
          return { ...prev, [runId]: next };
        });
        // Status-flip events touch the runs/queue/inbox shape — flag
        // a forced refresh on the next animation frame so we don't
        // hammer the API on busy event streams.
        if (
          event.type === "run.created" ||
          event.type === "run.completed" ||
          event.type === "run.aborted" ||
          event.type === "run.failed" ||
          event.type === "run.paused" ||
          event.type === "run.resumed" ||
          event.type === "approval.requested" ||
          event.type === "approval.approved" ||
          event.type === "approval.rejected" ||
          event.type === "suggestion.created" ||
          event.type === "suggestion.approved" ||
          event.type === "suggestion.rejected"
        ) {
          refreshFlagRef.current = true;
        }
        void runId;
      },
    });
    // Drain the refresh flag on a slow tick so bursts of events
    // collapse into a single API hit.
    const drain = window.setInterval(() => {
      if (!refreshFlagRef.current) return;
      refreshFlagRef.current = false;
      // Trigger a re-load by bumping the cached toast state to null
      // — easier: call the existing API helpers directly via a
      // side-effect that mutates the local arrays. We simply call
      // the listRuns/listTasks/getQueue/listApprovals/listSuggestions
      // /listNotifications helpers and update state.
      void (async () => {
        try {
          const [r, t, q] = await Promise.all([
            api.listRuns(),
            api.listTasks(),
            api
              .getQueue()
              .catch(() => ({ queue: [], state: null as SchedulerState | null })),
          ]);
          setRuns(r);
          setTasks(t);
          setQueue(q.queue);
          setScheduler(q.state);
        } catch {
          // best-effort
        }
      })();
    }, 750);
    return () => {
      disconnect();
      window.clearInterval(drain);
    };
  }, []);

  const active = runs.filter((r) => isActive(r.status));

  const handleAction = async (
    kind: "pause" | "resume" | "abort",
    runId: string,
  ): Promise<void> => {
    try {
      if (kind === "pause") await api.pauseRun(runId);
      else if (kind === "resume") await api.resumeRun(runId);
      else await api.abortRun(runId);
      setToast({ kind: "ok", text: `${kind} requested for ${runId}` });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleRetry = async (runId: string): Promise<void> => {
    try {
      const r = await api.retryRun(runId);
      setToast({
        kind: "ok",
        text: `Retrying ${runId} → ${r.message}${r.pid !== null ? ` (pid ${r.pid})` : ""}`,
      });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCreateTask = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    setNewTaskBusy(true);
    try {
      await api.addTask({ title, priority: newTaskPriority });
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setToast({ kind: "ok", text: `Created task "${title}"` });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setNewTaskBusy(false);
    }
  };

  const handleStartScheduler = async (): Promise<void> => {
    try {
      const r = await api.startScheduler();
      setToast({ kind: "ok", text: r.message });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleQueueTask = async (taskId: string): Promise<void> => {
    try {
      await api.queueTask(taskId);
      setToast({ kind: "ok", text: `Queued ${taskId}` });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleInbox = async (
    kind: "approve-approval" | "reject-approval" | "approve-suggestion" | "reject-suggestion",
    row: { runId: string; id: string },
  ): Promise<void> => {
    try {
      if (kind === "approve-approval") {
        await api.approveApproval({ runId: row.runId, approvalId: row.id });
      } else if (kind === "reject-approval") {
        await api.rejectApproval({ runId: row.runId, approvalId: row.id });
      } else if (kind === "approve-suggestion") {
        await api.approveSuggestion({ runId: row.runId, suggestionId: row.id });
      } else {
        await api.rejectSuggestion({ runId: row.runId, suggestionId: row.id });
      }
      setToast({ kind: "ok", text: `${kind.replace("-", " ")} ${row.id}` });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSpawn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const task = composerTask.trim();
    if (!task) return;
    setComposerBusy(true);
    try {
      const r = await api.spawnRun({
        task,
        effort: composerEffort || undefined,
        readOnly: composerReadOnly || undefined,
      });
      setToast({ kind: "ok", text: r.message });
      setComposerTask("");
      setComposerEffort("");
      setComposerReadOnly(false);
      setComposerOpen(false);
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setComposerBusy(false);
    }
  };
  const queuedTaskCount = tasks.filter((t) => t.status === "queued").length;
  const blockedTaskCount = tasks.filter((t) => t.status === "blocked").length;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              mission control
            </div>
            <h1 className="mt-1 text-[18px] font-medium">Live orchestrator</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-amaco-fg-muted">refreshes every 2s</span>
            <IssuesBadge
              count={issues.filter((i) => !i.resolved).length}
              open={issuesOpen}
              onToggle={() => setIssuesOpen((v) => !v)}
            />
            <button
              onClick={() => setComposerOpen((v) => !v)}
              className="rounded border border-amaco-accent/40 bg-amaco-accent/10 px-3 py-1.5 text-[12.5px] font-medium text-amaco-accent hover:bg-amaco-accent/20"
            >
              {composerOpen ? "Close" : "+ Run a task"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-stretch gap-2">
          <Stat label="active runs" value={String(active.length)} accent />
          <Stat label="total runs" value={String(runs.length)} />
          <Stat
            label="tasks"
            value={String(tasks.length)}
            hint="open backlog + queue"
          />
          <Stat
            label="queued"
            value={String(queuedTaskCount)}
            tint={queuedTaskCount > 0 ? "warn" : undefined}
          />
          <Stat
            label="blocked"
            value={String(blockedTaskCount)}
            tint={blockedTaskCount > 0 ? "fail" : undefined}
          />
        </div>
      </header>

      <AttentionBar
        counts={{
          approvals: approvals.length,
          suggestions: suggestions.length,
          unreadNotifications: notifications.filter((n) => !n.readAt).length,
          failedRuns: runs.filter(
            (r) => r.status === "failed" || r.status === "aborted",
          ).length,
        }}
        onFocusInbox={focusInbox}
      />

      {issuesOpen ? (
        <IssuesPanel
          issues={issues}
          onResolve={async (id) => {
            try {
              await api.resolveIssue(id);
              setIssues((cur) =>
                cur.map((i) => (i.id === id ? { ...i, resolved: true } : i)),
              );
            } catch (err) {
              setToast({
                kind: "err",
                text: err instanceof Error ? err.message : String(err),
              });
            }
          }}
          onClose={() => setIssuesOpen(false)}
        />
      ) : null}

      <div className="flex-1 grid gap-4 px-6 py-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        {/* Left rail: quick-create task + queue */}
        <aside className="flex flex-col gap-4">
          <QuickCreateTask
            title={newTaskTitle}
            priority={newTaskPriority}
            busy={newTaskBusy}
            onTitleChange={setNewTaskTitle}
            onPriorityChange={setNewTaskPriority}
            onSubmit={handleCreateTask}
          />
          <QueueCard
            onStartScheduler={handleStartScheduler}
            scheduler={scheduler}
            queue={queue}
            tasks={tasks}
            onOpenTask={onOpenTask}
            onShowQueue={onShowQueue}
            onQueueTask={handleQueueTask}
          />
        </aside>

      <div className="flex flex-col">
        {error ? (
          <div className="mb-3 rounded border border-amaco-fail/30 bg-amaco-fail/5 px-3 py-2 text-[12.5px] text-amaco-fail">
            {error}
          </div>
        ) : null}

        {toast ? (
          <div
            className={`mb-3 rounded border px-3 py-2 text-[12.5px] ${
              toast.kind === "ok"
                ? "border-amaco-success/40 bg-amaco-success/5 text-amaco-success"
                : "border-amaco-fail/30 bg-amaco-fail/5 text-amaco-fail"
            }`}
          >
            {toast.kind === "ok" ? "✓ " : "✗ "}
            {toast.text}
          </div>
        ) : null}

        {composerOpen ? (
          <form
            onSubmit={handleSpawn}
            className="mb-4 flex flex-col gap-2 rounded border border-amaco-accent/40 bg-amaco-panel-2/60 p-3"
          >
            <label className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              new run
            </label>
            <input
              autoFocus
              type="text"
              value={composerTask}
              onChange={(e) => setComposerTask(e.target.value)}
              placeholder='describe the change — e.g. "add health check endpoint"'
              className="rounded border border-amaco-border bg-amaco-panel px-2 py-1.5 text-[12.5px] text-amaco-fg outline-none focus:border-amaco-accent"
            />
            <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
              <label className="flex items-center gap-1.5 text-amaco-fg-muted">
                effort
                <select
                  value={composerEffort}
                  onChange={(e) =>
                    setComposerEffort(
                      e.target.value as "" | "low" | "medium" | "high",
                    )
                  }
                  className="rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-amaco-fg outline-none focus:border-amaco-accent"
                >
                  <option value="">auto</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-amaco-fg-muted">
                <input
                  type="checkbox"
                  checked={composerReadOnly}
                  onChange={(e) => setComposerReadOnly(e.target.checked)}
                />
                read-only
              </label>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="rounded border border-amaco-border bg-amaco-panel px-2 py-1 text-amaco-fg-dim hover:text-amaco-fg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={composerBusy || composerTask.trim().length === 0}
                  className="rounded border border-amaco-accent/40 bg-amaco-accent/10 px-3 py-1 font-medium text-amaco-accent hover:bg-amaco-accent/20 disabled:opacity-50"
                >
                  {composerBusy ? "Spawning…" : "Spawn amaco run"}
                </button>
              </div>
            </div>
            <div className="text-[10.5px] text-amaco-fg-muted">
              Runs server-side via{" "}
              <code className="amaco-mono">amaco run</code>; detached so the
              dashboard stays responsive. The new run appears below within ~2s.
            </div>
          </form>
        ) : null}

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              active runs ({active.length})
            </h2>
            <div className="flex gap-2 text-[11.5px]">
              <button
                onClick={onShowRoadmap}
                className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
              >
                Roadmap →
              </button>
              <button
                onClick={onShowQueue}
                className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
              >
                Queue →
              </button>
            </div>
          </div>
          {active.length === 0 ? (
            <div className="mt-3 rounded border border-dashed border-amaco-border bg-amaco-panel/40 px-4 py-6 text-center text-[12.5px] text-amaco-fg-muted">
              no active runs · start one with{" "}
              <code className="amaco-mono rounded bg-amaco-panel-2 px-1 py-0.5">
                amaco run "describe the change"
              </code>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {active.map((r) => (
                <RunCard
                  key={r.runId}
                  run={r}
                  events={eventsByRun[r.runId] ?? []}
                  onOpen={() => onSelectRun(r.runId)}
                  onAction={handleAction}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Right rail: attention inbox — approvals, suggestions, notifications. */}
      <aside
        ref={inboxRef}
        className="hidden xl:flex flex-col gap-3 scroll-mt-4"
      >
        <InboxApprovals
          items={approvals}
          onAction={handleInbox}
          onOpenRun={onSelectRun}
        />
        <InboxSuggestions
          items={suggestions}
          onAction={handleInbox}
          onOpenRun={onSelectRun}
        />
        <InboxNotifications items={notifications} onOpenRun={onSelectRun} />
      </aside>
      </div>
    </div>
  );
}

function QuickCreateTask({
  title,
  priority,
  busy,
  onTitleChange,
  onPriorityChange,
  onSubmit,
}: {
  title: string;
  priority: "low" | "medium" | "high";
  busy: boolean;
  onTitleChange: (v: string) => void;
  onPriorityChange: (p: "low" | "medium" | "high") => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3"
    >
      <label className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        quick task
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="task title"
        className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[12.5px] text-amaco-fg outline-none focus:border-amaco-accent"
      />
      <div className="flex items-center justify-between text-[11.5px]">
        <label className="flex items-center gap-1.5 text-amaco-fg-muted">
          priority
          <select
            value={priority}
            onChange={(e) =>
              onPriorityChange(e.target.value as "low" | "medium" | "high")
            }
            className="rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-amaco-fg outline-none focus:border-amaco-accent"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || title.trim().length === 0}
          className="rounded border border-amaco-accent/40 bg-amaco-accent/10 px-2 py-0.5 text-[11.5px] font-medium text-amaco-accent hover:bg-amaco-accent/20 disabled:opacity-50"
        >
          {busy ? "…" : "Create"}
        </button>
      </div>
    </form>
  );
}

function QueueCard({
  scheduler,
  queue,
  tasks,
  onOpenTask,
  onShowQueue,
  onQueueTask,
  onStartScheduler,
}: {
  scheduler: SchedulerState | null;
  queue: QueueEntry[];
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  onShowQueue: () => void;
  onQueueTask: (taskId: string) => Promise<void>;
  onStartScheduler: () => Promise<void>;
}) {
  const titleFor = (id: string): string =>
    tasks.find((t) => t.id === id)?.title ?? id;
  const ready = tasks.filter((t) => t.status === "ready");
  const liveness = deriveSchedulerLiveness(scheduler);
  const livenessTone =
    liveness.status === "live"
      ? "text-amaco-success"
      : liveness.status === "stale"
        ? "text-amaco-warn"
        : "text-amaco-fail";
  return (
    <div className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="flex items-center justify-between">
        <label className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          queue
        </label>
        <button
          onClick={onShowQueue}
          className="text-[10.5px] text-amaco-fg-dim hover:text-amaco-fg"
        >
          full queue →
        </button>
      </div>

      {/* Loud-by-default scheduler liveness — never silent. */}
      <div className="flex flex-col gap-1">
        <div className={`amaco-mono text-[10.5px] ${livenessTone}`}>
          ▌ {liveness.summary}
        </div>
        {!liveness.pickingUpWork ? (
          <button
            onClick={() => void onStartScheduler()}
            className="self-start rounded border border-amaco-accent/40 bg-amaco-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-amaco-accent hover:bg-amaco-accent/20"
          >
            ↻ Start scheduler (amaco queue run)
          </button>
        ) : null}
      </div>

      {scheduler ? (
        <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          policy {scheduler.queuePolicy}
          {" · "}max {scheduler.maxConcurrentRuns}
          {" · "}running {scheduler.runningTaskIds.length}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        {queue.length === 0 ? (
          <div className="text-[11.5px] text-amaco-fg-muted">
            queue is empty
          </div>
        ) : (
          queue.slice(0, 5).map((e) => {
            const items: ContextMenuItem[] = [
              { id: "open", label: "Open task", hint: "↵", onSelect: () => onOpenTask(e.taskId) },
              { id: "d1", label: "divider:" },
              {
                id: "copy-id",
                label: "Copy task ID",
                onSelect: () => void navigator.clipboard?.writeText(e.taskId),
              },
              {
                id: "copy-cli-queue",
                label: "Copy CLI: queue add",
                hint: "amaco queue add",
                onSelect: () =>
                  void navigator.clipboard?.writeText(
                    `amaco queue add ${e.taskId}`,
                  ),
              },
              {
                id: "copy-cli-run",
                label: "Copy CLI: tasks run",
                hint: "amaco tasks run",
                onSelect: () =>
                  void navigator.clipboard?.writeText(
                    `amaco tasks run ${e.taskId}`,
                  ),
              },
            ];
            return (
              <ContextMenuTrigger key={e.taskId} items={items}>
                {(h) => (
                  <button
                    onClick={() => onOpenTask(e.taskId)}
                    onContextMenu={h.onContextMenu}
                    className="flex items-center justify-between gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-left text-[11.5px] text-amaco-fg hover:bg-amaco-panel"
                    title="Right-click for actions"
                  >
                    <span className="truncate">{titleFor(e.taskId)}</span>
                    <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                      {e.priority[0]} · {e.source}
                    </span>
                  </button>
                )}
              </ContextMenuTrigger>
            );
          })
        )}
        {queue.length > 5 ? (
          <span className="text-[10.5px] text-amaco-fg-muted">
            + {queue.length - 5} more
          </span>
        ) : null}
      </div>
      {ready.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-amaco-border/60 pt-2">
          <span className="text-[10.5px] text-amaco-fg-muted">ready ({ready.length})</span>
          {ready.slice(0, 3).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2 text-[11.5px]"
            >
              <button
                onClick={() => onOpenTask(t.id)}
                className="truncate text-amaco-fg hover:text-amaco-accent"
              >
                {t.title}
              </button>
              <button
                onClick={() => void onQueueTask(t.id)}
                className="amaco-mono rounded border border-amaco-accent/40 px-1.5 text-[10.5px] text-amaco-accent hover:bg-amaco-accent/10"
              >
                queue
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RunCard({
  run,
  events,
  onOpen,
  onAction,
  onRetry,
}: {
  run: RunState;
  events: AmacoEvent[];
  onOpen: () => void;
  onAction: (kind: "pause" | "resume" | "abort", runId: string) => Promise<void>;
  onRetry: (runId: string) => Promise<void>;
}) {
  const tone =
    STATUS_TONE[run.status] ??
    "bg-amaco-panel-2 text-amaco-fg-muted border-amaco-border";
  const stepIdx = currentStepIndex(run.status);
  const live = deriveLive(events);
  const canPause =
    run.status !== "paused" &&
    run.status !== "merge_ready" &&
    run.status !== "failed" &&
    run.status !== "aborted" &&
    run.status !== "blocked" &&
    !run.pauseRequested;
  const canResume = run.status === "paused" || run.pauseRequested;
  const canAbort =
    run.status !== "merge_ready" &&
    run.status !== "failed" &&
    run.status !== "aborted";
  // Retry only when the run is finished (good or bad). The original
  // run record stays on disk untouched — retry gets a fresh runId.
  const canRetry =
    run.status === "failed" ||
    run.status === "aborted" ||
    run.status === "blocked" ||
    run.status === "merge_ready";

  const copyToClipboard = (text: string): void => {
    void navigator.clipboard?.writeText?.(text).catch(() => undefined);
  };

  const menuItems: ContextMenuItem[] = [
    { id: "open", label: "Open run", hint: "↵", onSelect: onOpen },
    { id: "div1", label: "divider:1" },
    {
      id: "pause",
      label: "Pause",
      disabled: !canPause,
      onSelect: () => onAction("pause", run.runId),
    },
    {
      id: "resume",
      label: "Resume",
      disabled: !canResume,
      onSelect: () => onAction("resume", run.runId),
    },
    {
      id: "abort",
      label: "Abort",
      tone: "danger",
      disabled: !canAbort,
      onSelect: () => {
        if (window.confirm(`Abort run ${run.runId}? This cannot be undone.`)) {
          void onAction("abort", run.runId);
        }
      },
    },
    {
      id: "retry",
      label: "Retry with same args",
      tone: "accent",
      hint: "fresh runId",
      disabled: !canRetry,
      onSelect: () => onRetry(run.runId),
    },
    { id: "div2", label: "divider:2" },
    {
      id: "copy-id",
      label: "Copy run id",
      hint: run.runId.slice(0, 16) + "…",
      onSelect: () => copyToClipboard(run.runId),
    },
    {
      id: "copy-cli-status",
      label: "Copy CLI: status",
      hint: "amaco status …",
      onSelect: () => copyToClipboard(`amaco status ${run.runId}`),
    },
    {
      id: "copy-cli-replay",
      label: "Copy CLI: replay",
      hint: "amaco replay …",
      onSelect: () => copyToClipboard(`amaco replay ${run.runId}`),
    },
    ...(run.worktreePath
      ? [
          {
            id: "copy-wt",
            label: "Copy worktree path",
            onSelect: () => copyToClipboard(run.worktreePath ?? ""),
          },
        ]
      : []),
  ];

  return (
    <ContextMenuTrigger items={menuItems}>
      {(handlers) => (
    <div
      onContextMenu={handlers.onContextMenu}
      className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3 transition-colors hover:border-amaco-accent/40 hover:bg-amaco-panel-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`amaco-mono rounded border px-1.5 py-0.5 text-[10.5px] ${tone}`}
        >
          {run.status}
        </span>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          {relTime(run.updatedAt)}
        </span>
      </div>
      <button
        onClick={onOpen}
        className="text-left text-[12.5px] font-medium text-amaco-fg hover:text-amaco-accent"
      >
        {run.task.length > 80 ? `${run.task.slice(0, 79)}…` : run.task}
      </button>
      <Stepper stepIdx={stepIdx} />
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10.5px]">
        {live.currentAgent ? (
          <span>
            <span className="text-amaco-fg-muted">agent </span>
            <span className="text-amaco-accent">{live.currentAgent}</span>
          </span>
        ) : (
          <span className="text-amaco-fg-muted">no active agent</span>
        )}
        {live.currentProvider ? (
          <span className="text-amaco-fg-muted">
            via <span className="text-amaco-fg">{live.currentProvider}</span>
          </span>
        ) : null}
        {live.currentMcp.length > 0 ? (
          <span>
            <span className="text-amaco-fg-muted">mcp </span>
            <span className="text-amaco-fg">{live.currentMcp.join(", ")}</span>
          </span>
        ) : null}
      </div>
      <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
        {run.runId}
        {run.effort ? <span> · {run.effort}</span> : null}
        {run.readOnly ? (
          <span className="text-amaco-warn"> · read-only</span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1.5 border-t border-amaco-border/60 pt-2">
        <ActionBtn
          label="Pause"
          tone="warn"
          disabled={!canPause}
          onClick={() => void onAction("pause", run.runId)}
        />
        <ActionBtn
          label="Resume"
          tone="info"
          disabled={!canResume}
          onClick={() => void onAction("resume", run.runId)}
        />
        <ActionBtn
          label="Abort"
          tone="fail"
          disabled={!canAbort}
          onClick={() => {
            if (
              window.confirm(`Abort run ${run.runId}?\n\nThis cannot be undone.`)
            ) {
              void onAction("abort", run.runId);
            }
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          <span
            className="amaco-mono text-[9.5px] text-amaco-fg-muted"
            title="right-click for more actions"
          >
            ⋯
          </span>
          <button
            onClick={onOpen}
            className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-2 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
          >
            Open →
          </button>
        </div>
      </div>
    </div>
      )}
    </ContextMenuTrigger>
  );
}

function ActionBtn({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "warn" | "info" | "fail";
  disabled: boolean;
  onClick: () => void;
}) {
  const toneClasses =
    tone === "warn"
      ? "border-amaco-warn/30 text-amaco-warn hover:bg-amaco-warn/10"
      : tone === "info"
        ? "border-amaco-info/30 text-amaco-info hover:bg-amaco-info/10"
        : "border-amaco-fail/30 text-amaco-fail hover:bg-amaco-fail/10";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`amaco-mono rounded border bg-amaco-panel-2 px-2 py-0.5 text-[10.5px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${toneClasses}`}
    >
      {label}
    </button>
  );
}

function Stepper({ stepIdx }: { stepIdx: number }) {
  return (
    <div className="flex items-center gap-1">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = stepIdx > i;
        const current = stepIdx === i;
        return (
          <div key={step.key} className="flex flex-1 items-center gap-1">
            <span
              className={`h-1.5 flex-1 rounded ${
                done
                  ? "bg-amaco-success/60"
                  : current
                    ? "bg-amaco-accent"
                    : "bg-amaco-panel-2"
              }`}
            />
            <span
              className={`amaco-mono text-[9px] uppercase tracking-wider ${
                done
                  ? "text-amaco-success/80"
                  : current
                    ? "text-amaco-accent"
                    : "text-amaco-fg-muted"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tint?: "warn" | "fail";
  accent?: boolean;
}) {
  const valueColor =
    tint === "warn"
      ? "text-amaco-warn"
      : tint === "fail"
        ? "text-amaco-fail"
        : accent
          ? "text-amaco-accent"
          : "text-amaco-fg";
  return (
    <div className="flex flex-col rounded border border-amaco-border bg-amaco-panel-2 px-3 py-1.5 min-w-[110px]">
      <span className="text-[10.5px] text-amaco-fg-muted">{label}</span>
      <span className={`text-[16px] font-semibold ${valueColor}`}>{value}</span>
      {hint ? (
        <span className="text-[10.5px] text-amaco-fg-muted">{hint}</span>
      ) : null}
    </div>
  );
}

type InboxKind =
  | "approve-approval"
  | "reject-approval"
  | "approve-suggestion"
  | "reject-suggestion";

function InboxApprovals({
  items,
  onAction,
  onOpenRun,
}: {
  items: ApprovalRow[];
  onAction: (
    kind: InboxKind,
    row: { runId: string; id: string },
  ) => Promise<void>;
  onOpenRun: (runId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          approvals
        </span>
        <span
          className={`amaco-mono rounded px-1.5 text-[10.5px] ${
            items.length > 0
              ? "bg-amaco-warn/15 text-amaco-warn"
              : "bg-amaco-panel-2 text-amaco-fg-muted"
          }`}
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <span className="text-[11.5px] text-amaco-fg-muted">
          nothing waiting on you
        </span>
      ) : (
        items.slice(0, 5).map((a) => (
          <div
            key={`${a.runId}-${a.id}`}
            className="flex flex-col gap-1 rounded border border-amaco-warn/30 bg-amaco-warn/5 px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => onOpenRun(a.runId)}
                className="amaco-mono text-[10.5px] text-amaco-warn hover:underline"
              >
                {a.agentId} · {a.stageId}
              </button>
              <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                {a.riskLevel}
              </span>
            </div>
            {a.reason ? (
              <span className="text-[11.5px] text-amaco-fg-dim">
                {a.reason.length > 90 ? `${a.reason.slice(0, 89)}…` : a.reason}
              </span>
            ) : null}
            <div className="flex gap-1.5">
              <button
                onClick={() =>
                  void onAction("approve-approval", { runId: a.runId, id: a.id })
                }
                className="amaco-mono rounded border border-amaco-success/40 px-2 py-0.5 text-[10.5px] text-amaco-success hover:bg-amaco-success/10"
              >
                Approve
              </button>
              <button
                onClick={() =>
                  void onAction("reject-approval", { runId: a.runId, id: a.id })
                }
                className="amaco-mono rounded border border-amaco-fail/30 px-2 py-0.5 text-[10.5px] text-amaco-fail hover:bg-amaco-fail/10"
              >
                Reject
              </button>
            </div>
          </div>
        ))
      )}
      {items.length > 5 ? (
        <span className="text-[10.5px] text-amaco-fg-muted">
          + {items.length - 5} more
        </span>
      ) : null}
    </div>
  );
}

function InboxSuggestions({
  items,
  onAction,
  onOpenRun,
}: {
  items: SuggestionRow[];
  onAction: (
    kind: InboxKind,
    row: { runId: string; id: string },
  ) => Promise<void>;
  onOpenRun: (runId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          suggestions
        </span>
        <span
          className={`amaco-mono rounded px-1.5 text-[10.5px] ${
            items.length > 0
              ? "bg-amaco-info/15 text-amaco-info"
              : "bg-amaco-panel-2 text-amaco-fg-muted"
          }`}
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <span className="text-[11.5px] text-amaco-fg-muted">no open suggestions</span>
      ) : (
        items.slice(0, 5).map((s) => (
          <div
            key={`${s.runId}-${s.id}`}
            className="flex flex-col gap-1 rounded border border-amaco-info/30 bg-amaco-info/5 px-2 py-1.5"
          >
            <button
              onClick={() => onOpenRun(s.runId)}
              className="truncate text-left text-[11.5px] font-medium text-amaco-fg hover:text-amaco-accent"
            >
              {s.title}
            </button>
            {s.file ? (
              <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                {s.file}
                {s.lineStart
                  ? `:${s.lineStart}${s.lineEnd ? `-${s.lineEnd}` : ""}`
                  : ""}
              </span>
            ) : null}
            <div className="flex gap-1.5">
              <button
                onClick={() =>
                  void onAction("approve-suggestion", {
                    runId: s.runId,
                    id: s.id,
                  })
                }
                className="amaco-mono rounded border border-amaco-success/40 px-2 py-0.5 text-[10.5px] text-amaco-success hover:bg-amaco-success/10"
              >
                Approve
              </button>
              <button
                onClick={() =>
                  void onAction("reject-suggestion", {
                    runId: s.runId,
                    id: s.id,
                  })
                }
                className="amaco-mono rounded border border-amaco-fail/30 px-2 py-0.5 text-[10.5px] text-amaco-fail hover:bg-amaco-fail/10"
              >
                Reject
              </button>
            </div>
          </div>
        ))
      )}
      {items.length > 5 ? (
        <span className="text-[10.5px] text-amaco-fg-muted">
          + {items.length - 5} more
        </span>
      ) : null}
    </div>
  );
}

function InboxNotifications({
  items,
  onOpenRun,
}: {
  items: NotificationRecord[];
  onOpenRun: (runId: string) => void;
}) {
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          notifications
        </span>
        <span
          className={`amaco-mono rounded px-1.5 text-[10.5px] ${
            unread > 0
              ? "bg-amaco-accent/15 text-amaco-accent"
              : "bg-amaco-panel-2 text-amaco-fg-muted"
          }`}
        >
          {unread > 0 ? `${unread} new` : items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <span className="text-[11.5px] text-amaco-fg-muted">no notifications yet</span>
      ) : (
        items.slice(0, 6).map((n) => (
          <button
            key={n.id}
            onClick={() => (n.runId ? onOpenRun(n.runId) : undefined)}
            disabled={!n.runId}
            className="flex flex-col gap-0.5 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-left text-[11.5px] text-amaco-fg hover:bg-amaco-panel disabled:cursor-default disabled:hover:bg-amaco-panel-2"
          >
            <span className="flex items-center gap-1.5">
              <span
                className={
                  n.severity === "critical"
                    ? "text-amaco-fail"
                    : n.severity === "warning" || n.severity === "attention"
                      ? "text-amaco-warn"
                      : n.severity === "success"
                        ? "text-amaco-success"
                        : "text-amaco-fg-muted"
                }
              >
                {n.severity === "critical"
                  ? "✗"
                  : n.severity === "warning" || n.severity === "attention"
                    ? "!"
                    : n.severity === "success"
                      ? "✓"
                      : "·"}
              </span>
              <span className="truncate">{n.title}</span>
              {!n.readAt ? (
                <span className="amaco-mono ml-auto text-[10.5px] text-amaco-accent">
                  new
                </span>
              ) : null}
            </span>
            <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
              {n.category}
            </span>
          </button>
        ))
      )}
    </div>
  );
}


type IssueLike = {
  id: string;
  createdAt: string;
  kind: string;
  message: string;
  detail?: string;
  fix?: string;
  context?: Record<string, unknown>;
  resolved: boolean;
};

function IssuesBadge({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const tone =
    count === 0
      ? "border-amaco-border bg-amaco-panel-2 text-amaco-fg-muted"
      : "border-amaco-fail/40 bg-amaco-fail/10 text-amaco-fail";
  return (
    <button
      onClick={onToggle}
      title={count === 0 ? "no captured failures" : `${count} unresolved issue(s)`}
      className={`amaco-mono rounded border px-2 py-1 text-[11.5px] font-medium ${tone} hover:opacity-80`}
    >
      {open ? "✗ Issues" : count === 0 ? "✓ Issues 0" : `✗ Issues ${count}`}
    </button>
  );
}

function IssuesPanel({
  issues,
  onResolve,
  onClose,
}: {
  issues: IssueLike[];
  onResolve: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const unresolved = issues.filter((i) => !i.resolved);
  return (
    <div className="border-b border-amaco-fail/30 bg-amaco-fail/5 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-medium text-amaco-fail">
          Issues — captured failures · {unresolved.length} unresolved · {issues.length} total
        </div>
        <button
          onClick={onClose}
          className="text-[11.5px] text-amaco-fg-dim hover:text-amaco-fg"
        >
          Close
        </button>
      </div>
      {issues.length === 0 ? (
        <div className="mt-2 text-[12px] text-amaco-fg-muted">
          no failures captured yet · the philosophy is no silent failures, so
          anything that breaks lands here
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {issues.slice(0, 12).map((issue) => (
            <div
              key={issue.id}
              className={`rounded border px-3 py-2 ${issue.resolved ? "border-amaco-border bg-amaco-panel/30 opacity-60" : "border-amaco-fail/30 bg-amaco-panel"}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2 text-[12px]">
                  <span className={`amaco-mono text-[10.5px] ${issue.resolved ? "text-amaco-fg-muted" : "text-amaco-fail"}`}>
                    {issue.resolved ? "✓" : "✗"} {issue.kind}
                  </span>
                  <span className="font-medium text-amaco-fg">{issue.message}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">{issue.createdAt.slice(11, 19)}</span>
                  {!issue.resolved ? (
                    <button
                      onClick={() => void onResolve(issue.id)}
                      className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-2 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
                    >
                      ✓ resolve
                    </button>
                  ) : null}
                </div>
              </div>
              {issue.fix ? (
                <div className="mt-1 text-[11.5px] text-amaco-success">
                  Fix: {issue.fix}
                </div>
              ) : null}
              {issue.context && Object.keys(issue.context).length > 0 ? (
                <div className="mt-1 text-[10.5px] text-amaco-fg-muted amaco-mono">
                  {Object.entries(issue.context)
                    .slice(0, 4)
                    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                    .join(" · ")}
                </div>
              ) : null}
              {issue.detail ? (
                <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-amaco-panel-2/60 px-2 py-1 text-[10.5px] text-amaco-fg-dim">{issue.detail}</pre>
              ) : null}
            </div>
          ))}
          {issues.length > 12 ? (
            <div className="text-[10.5px] text-amaco-fg-muted">+ {issues.length - 12} more</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

