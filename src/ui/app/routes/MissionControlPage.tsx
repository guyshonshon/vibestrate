import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { streamAllEvents } from "../../lib/aggregateEvents.js";
import { push as pushDesktop } from "../../lib/desktopNotify.js";
import { navigate } from "../App.js";
import { RunComposerCard } from "../../components/mission/v3/RunComposerCard.js";
import { LiveRunsSection } from "../../components/mission/v3/LiveRuns.js";
import { RecentRunsSection } from "../../components/mission/v3/RecentRuns.js";
import {
  ApprovalsCard,
  NotificationsCard,
  ShortcutsCard,
  WorkspaceCard,
} from "../../components/mission/v3/RightRail.js";
import type {
  VibestrateEvent,
  ApprovalRequest,
  NotificationRecord,
  RunState,
  RunStatus,
  SchedulerState,
} from "../../lib/types.js";

type ApprovalRow = ApprovalRequest & { runId: string };

type Props = {
  onSelectRun: (runId: string) => void;
  onShowRoadmap: () => void;
  onShowQueue: () => void;
  onShowRunsList: () => void;
  onShowSettings: () => void;
  onOpenTask: (taskId: string) => void;
  onShowRunDiff?: (runId: string) => void;
};

const ACTIVE_STATUSES: RunStatus[] = [
  "planning",
  "planned",
  "architecting",
  "architected",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "waiting_for_approval",
  "paused",
];

function isActive(s: RunStatus): boolean {
  return ACTIVE_STATUSES.includes(s);
}

export function MissionControlPage({ onSelectRun }: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, VibestrateEvent[]>>({});
  const [diffByRun, setDiffByRun] = useState<
    Record<string, { insertions: number; deletions: number; files: number }>
  >({});
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Runs + per-run events / diff / approvals ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [r, q] = await Promise.all([
          api.listRuns(),
          api
            .getQueue()
            .catch(() => ({ queue: [], state: null as SchedulerState | null })),
        ]);
        if (cancelled) return;
        setRuns(r);
        setScheduler(q.state);
        setError(null);

        const byRun: Record<string, VibestrateEvent[]> = {};
        const diffsByRun: Record<
          string,
          { insertions: number; deletions: number; files: number }
        > = {};
        const aprAggregate: ApprovalRow[] = [];
        await Promise.all(
          r.map(async (run) => {
            if (!isActive(run.status)) return;
            await Promise.all([
              api
                .listEvents(run.runId)
                .then((evs) => {
                  byRun[run.runId] = evs.slice(-50);
                })
                .catch(() => {
                  byRun[run.runId] = [];
                }),
              api
                .getDiff(run.runId)
                .then((snap) => {
                  if (!snap) return;
                  diffsByRun[run.runId] = {
                    insertions: snap.totals.insertions,
                    deletions: snap.totals.deletions,
                    files: snap.totals.files,
                  };
                })
                .catch(() => undefined),
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
            ]);
          }),
        );
        if (cancelled) return;
        setEventsByRun(byRun);
        setDiffByRun(diffsByRun);
        aprAggregate.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setApprovals(aprAggregate);

        const notif = await api.listNotifications().catch(() => ({
          notifications: [] as NotificationRecord[],
          unread: 0,
        }));
        if (!cancelled) setNotifications(notif.notifications);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // ── SSE: realtime events for the active runs' MiniTerminal previews ──
  useEffect(() => {
    const disconnect = streamAllEvents({
      onEvent: ({ runId, event }) => {
        if (event.type === "approval.requested") {
          pushDesktop({
            kind: "approval-requested",
            id: runId,
            title: "Approval requested",
            body: `Run ${runId} needs you to approve before it can continue.`,
            onClick: () => onSelectRun(runId),
          });
        } else if (event.type === "run.failed" || event.type === "run.aborted") {
          pushDesktop({
            kind: "run-failed",
            id: runId,
            title: event.type === "run.failed" ? "Run failed" : "Run aborted",
            body: event.message ?? `Run ${runId} stopped.`,
            onClick: () => onSelectRun(runId),
          });
        }
        setEventsByRun((prev) => {
          const cur = prev[runId] ?? [];
          const next = [...cur, event].slice(-50);
          return { ...prev, [runId]: next };
        });
      },
    });
    return () => disconnect();
  }, [onSelectRun]);

  // Auto-dismiss toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const activeRuns = runs.filter((r) => isActive(r.status));
  const completed = runs
    .filter(
      (r) =>
        r.status === "merge_ready" ||
        r.status === "failed" ||
        r.status === "aborted",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

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

  const handleApprove = async (a: ApprovalRow) => {
    try {
      await api.approveApproval({ runId: a.runId, approvalId: a.id });
      setToast({ kind: "ok", text: `approved ${a.id}` });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };
  const handleReject = async (a: ApprovalRow) => {
    try {
      await api.rejectApproval({ runId: a.runId, approvalId: a.id });
      setToast({ kind: "ok", text: `rejected ${a.id}` });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleNotificationOpen = (n: NotificationRecord) => {
    if (n.runId) navigate({ kind: "run", runId: n.runId });
    else if (n.taskId) navigate({ kind: "task", taskId: n.taskId });
    if (!n.readAt) {
      void api.markNotificationRead(n.id).catch(() => undefined);
    }
  };

  return (
    <div className="relative z-10 mx-auto max-w-[1480px] px-8 pt-6 pb-16 fade-up">
      {/* Eyebrow row */}
      <section className="mt-2">
        <div className="flex items-baseline justify-end mb-3">
          <button
            type="button"
            onClick={() => navigate({ kind: "compose" })}
            className="text-[11.5px] text-violet-soft hover:text-violet-soft/80"
            title="Open the dedicated run page (new design, full control surface)"
          >
            Open the full run page →
          </button>
        </div>
        <RunComposerCard />
      </section>

      {/* Live now - appears the instant a run is sent, so it's obvious the
       * task started. Multiple runs stack here (the composer above stays
       * usable, so you can launch more in parallel). */}
      {activeRuns.length > 0 ? (
        <section className="mt-6">
          {activeRuns.length > 0 ? (
            <LiveRunsSection
              runs={activeRuns}
              eventsByRun={eventsByRun}
              diffByRun={diffByRun}
              onOpen={onSelectRun}
              onPause={(id) => void handleAction("pause", id)}
              onResume={(id) => void handleAction("resume", id)}
              onAbort={(id) => void handleAction("abort", id)}
            />
          ) : null}
        </section>
      ) : null}

      {error || toast ? (
        <div className="mt-4">
          {error ? (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
              {error}
            </div>
          ) : null}
          {toast ? (
            <div
              role="status"
              className={
                toast.kind === "ok"
                  ? "rounded-lg border px-3 py-1.5 text-[12.5px] border-emerald-400/30 bg-emerald-500/5 text-emerald-300"
                  : "rounded-lg border px-3 py-1.5 text-[12.5px] border-rose-400/30 bg-rose-500/5 text-rose-300"
              }
            >
              {toast.kind === "ok" ? "✓ " : "✗ "}
              {toast.text}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Body: live + inbox */}
      <section className="mt-10 grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-8 space-y-5">
          <RecentRunsSection
            runs={completed}
            onOpen={onSelectRun}
            onShowAll={() => navigate({ kind: "runs" })}
          />
        </div>
        {/*
         * Right rail. At xl+ this is a 4-col-wide sidebar with the cards
         * stacked vertically. At intermediate widths (md/lg) the rail
         * runs full-width *below* the live execution and we switch to a
         * 2-column sub-grid so the 4 cards form a compact 2×2 block
         * instead of a tall single-column stack. On narrow viewports
         * the cards fall back to 1 column.
         */}
        <aside className="col-span-12 xl:col-span-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5">
            <ApprovalsCard
              approvals={approvals}
              onOpenRun={onSelectRun}
              onApprove={(a) => void handleApprove(a)}
              onReject={(a) => void handleReject(a)}
            />
            <WorkspaceCard runs={runs} scheduler={scheduler} />
            <NotificationsCard
              notifications={notifications}
              onOpen={handleNotificationOpen}
            />
            <ShortcutsCard />
          </div>
        </aside>
      </section>
    </div>
  );
}
