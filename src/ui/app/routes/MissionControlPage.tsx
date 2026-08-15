/**
 * Mission control route - the page where work starts. Its body renders the
 * hero, the composer, and the "waiting on you" deck of pending approvals.
 *
 * The load loop re-fetches runs on an interval and whenever a
 * `vibestrate:runs-refresh` window event fires, then fans out per-active-run
 * diff and approval requests through `settle` so one failing request does not
 * cost the others. The approvals failure is kept as a value rather than
 * swallowed, because an empty list and a lost fetch look identical here.
 *
 * `StatCard` and `RunCard` are defined and exported from this file but are not
 * rendered by this page.
 */
import { Button } from "../../components/design/Button.js";
import { isActiveStatus, type RunFilter } from "../../lib/run-filter.js";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { streamAllEvents } from "../../lib/aggregateEvents.js";
import { push as pushDesktop } from "../../lib/desktopNotify.js";
import { navigate } from "../App.js";
import { MissionComposer } from "../../components/mission/MissionComposer.js";
import { SupervisorControl } from "../../components/supervisor/SupervisorControl.js";
import { RunActions } from "../../components/mission/RunActions.js";
import { Chip } from "../../components/design/Chip.js";
import { PanelBoard, type RegisteredPanel } from "../../components/layout/PanelBoard.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { HeroNumber } from "./page-skeletons.js";
import { ErrorView } from "../../lib/error-view.js";
import { settle } from "../../lib/settled.js";
import { PhaseRail, statusMessage } from "../../components/mission/runPhase.js";
import {
  Sparkline,
  type SparkTone,
} from "../../components/design/Sparkline.js";
import { useToast, ToastView } from "../../components/design/useToast.js";
import type {
  ApprovalRequest,
  RunState,
  RunStatus,
} from "../../lib/types.js";

type ApprovalRow = ApprovalRequest & { runId: string };

type Props = {
  onSelectRun: (runId: string) => void;
  onShowRoadmap: () => void;
  onShowQueue: () => void;
  onShowRunsList: (status?: RunFilter) => void;
  onShowSettings: () => void;
  onOpenTask: (taskId: string) => void;
  onShowRunDiff?: (runId: string) => void;
  onShowDashboard: () => void;
};

const isActive = isActiveStatus;

const TONE_COLOR: Record<string, string> = {
  violet: "#a78bfa",
  emerald: "#34d399",
  amber: "#fb923c",
  rose: "#fb7185",
  chalk: "#8c8a96",
};

const SPARK_TONES: SparkTone[] = ["violet", "sky", "emerald", "amber", "rose"];
function sparkTone(tone: string): SparkTone {
  return SPARK_TONES.includes(tone as SparkTone)
    ? (tone as SparkTone)
    : "violet";
}

const STATUS_META: Partial<Record<RunStatus, { tone: string; label: string }>> = {
  merge_ready: { tone: "emerald", label: "merge ready" },
  failed: { tone: "rose", label: "failed" },
  aborted: { tone: "chalk", label: "aborted" },
  waiting_for_approval: { tone: "amber", label: "waiting for approval" },
  paused: { tone: "chalk", label: "paused" },
};

export function statusMeta(s: RunStatus): { tone: string; label: string } {
  return STATUS_META[s] ?? { tone: "violet", label: s.replace(/_/g, " ") };
}

export function relTime(iso: string): string {
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return "";
  const s = (Date.now() - d) / 1000;
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}


export function MissionControlPage({ onSelectRun, onShowDashboard }: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [diffByRun, setDiffByRun] = useState<
    Record<string, { insertions: number; deletions: number }>
  >({});
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const { toast, showToast } = useToast(4000);
  const [error, setError] = useState<string | null>(null);
  // "Waiting on you" renders nothing when the list is empty, which is exactly
  // what a swallowed fetch produced: the dashboard said no run needed the user
  // while one sat blocked on their approval. Kept as a value so the section can
  // say it does not know.
  const [approvalsError, setApprovalsError] = useState<unknown>(null);
  // The hero's headline fact is "is anything waiting on me". An empty
  // `approvals` before the fetch answers is not "Clear", it is not-yet-known,
  // and the two must not look the same.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.listRuns();
        if (cancelled) return;
        setRuns(r);
        setError(null);
        const diffs: Record<string, { insertions: number; deletions: number }> = {};
        const apr: ApprovalRow[] = [];
        let aprError: unknown = null;
        await Promise.all(
          r
            .filter((run) => isActive(run.status))
            .map(async (run) => {
              const [snap, list] = await Promise.all([
                settle(api.getDiff(run.runId)),
                settle(api.listApprovals(run.runId)),
              ]);
              // The diff here is a glanceable +/- badge on a run card, and the
              // run page owns the honest version - safe to drop from the card.
              if (snap.ok && snap.value) {
                diffs[run.runId] = {
                  insertions: snap.value.totals.insertions,
                  deletions: snap.value.totals.deletions,
                };
              }
              if (list.ok) {
                for (const a of list.value) {
                  if (a.status === "pending") apr.push({ ...a, runId: run.runId });
                }
              } else {
                aprError ??= list.error;
              }
            }),
        );
        if (cancelled) return;
        setDiffByRun(diffs);
        apr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setApprovals(apr);
        setApprovalsError(aprError);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 4000);
    const onRefresh = () => void load();
    window.addEventListener("vibestrate:runs-refresh", onRefresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("vibestrate:runs-refresh", onRefresh);
    };
  }, []);

  // Desktop notifications on approval-requested / run failure (kept from v3).
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
      },
    });
    return () => disconnect();
  }, [onSelectRun]);

  const activeRuns = useMemo(() => runs.filter((r) => isActive(r.status)), [runs]);
  const completed = useMemo(
    () =>
      runs
        .filter(
          (r) =>
            r.status === "merge_ready" || r.status === "failed" || r.status === "aborted",
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 8),
    [runs],
  );

  const mergeReady = useMemo(
    () => runs.filter((r) => r.status === "merge_ready").length,
    [runs],
  );

  const week = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const base = startOfToday.getTime();
    const dayMs = 86_400_000;
    const counts = new Array(7).fill(0) as number[];
    for (const r of runs) {
      const t = Date.parse(r.startedAt);
      if (!Number.isFinite(t)) continue;
      const day = new Date(t);
      day.setHours(0, 0, 0, 0);
      const diff = Math.floor((base - day.getTime()) / dayMs);
      if (diff >= 0 && diff < 7) counts[6 - diff] = (counts[6 - diff] ?? 0) + 1;
    }
    return { counts, total: counts.reduce((a, b) => a + b, 0) };
  }, [runs]);

  const decide = async (a: ApprovalRow, approve: boolean) => {
    try {
      if (approve) await api.approveApproval({ runId: a.runId, approvalId: a.id });
      else await api.rejectApproval({ runId: a.runId, approvalId: a.id });
      showToast({ kind: "ok", text: approve ? "approved" : "rejected" });
    } catch (err) {
      showToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            /* No third line under the state: the value and the caption already
               say it, in both tones. "Clear / Nothing blocked / Nothing is
               waiting on you" is one fact written three times. */
            state={{
              // A bare bone rather than a Skeleton region: the composer and the
              // dashboard button beside it are already usable, so a sheen across
              // the header would overstate what is actually pending.
              value: !loaded ? (
                <HeroNumber w={72} />
              ) : approvals.length > 0 ? (
                approvals.length
              ) : (
                "Clear"
              ),
              caption: !loaded
                ? "Approvals"
                : approvals.length > 0
                  ? "Waiting on you"
                  : "Nothing blocked",
              tone: !loaded ? "neutral" : approvals.length > 0 ? "amber" : "emerald",
            }}
            title="Mission control"
            actions={
              <Button variant="secondary" size="sm" onClick={onShowDashboard}>
                Open dashboard
              </Button>
            }
            footer="Runs, queue and spend live on the dashboard."
          />
        </Cell>

        {/* The supervisor comes FIRST, above the composer.
            With autonomy on it can make the task and start the run itself, so
            saying what you want out loud is a real way in rather than a side
            channel - which is why it precedes the form rather than replacing
            it. The form stays for when you already know the flow and crew you
            want; a model should not be the only door into starting work. */}
        <Cell size="full" reason="masthead">
          <SupervisorControl runId={null} compact />
        </Cell>

        <Cell size="full" reason="masthead">
          <MissionComposer />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView
              compact
              err={error}
              onRetry={() =>
                window.dispatchEvent(new Event("vibestrate:runs-refresh"))
              }
            />
          </Cell>
        ) : null}

        <Cell size="full" reason="masthead">
          <ToastView
            toast={toast}
            variant="inline"
            prefix="none"
            className="rounded-[12px] border px-4 py-2.5 text-[13px]"
          />
        </Cell>

        {approvalsError ? (
          <Cell size="full" reason="masthead">
            <ErrorView
              compact
              err={approvalsError}
              onRetry={() =>
                window.dispatchEvent(new Event("vibestrate:runs-refresh"))
              }
              override={{
                title: "Couldn't check which runs are waiting on you",
                hint: "A run may be blocked on your approval without appearing below. Retry, or open the run directly.",
              }}
            />
          </Cell>
        ) : null}

        {approvals.length > 0 ? (
          <Cell size="full" reason="nested-deck">
          <section className="rounded-[22px] border border-amber-soft/25 bg-coal-600 p-6">
            <h2 className="mb-3 text-[18px] font-bold text-violet-vivid">Waiting on you</h2>
            {/* A Deck, not a full-width stacked list - a single short reason in
             * a page-width row left a dead gap before Approve/Reject at the far
             * edge. Halves keep each card dense and cap the reason's reading
             * width without a fixed max-w. */}
            <Deck>
              {approvals.map((a) => (
                <Cell key={`${a.runId}:${a.id}`} size="half">
                <div className="rounded-[14px] bg-coal-500/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Chip tone="amber" contained>waiting</Chip>
                    <span className="min-w-0 truncate text-[12px] font-medium text-chalk-400">
                      {a.roleId} · {a.stageId.replace(/_/g, " ")}
                    </span>
                    <span className="ml-auto shrink-0 text-meta text-chalk-400">{relTime(a.createdAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13.5px] text-chalk-100">
                    {a.reason ?? a.requestedAction ?? "Approval requested"}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => navigate({ kind: "run", runId: a.runId, tab: "approvals" })}
                      className="flex items-center gap-1.5 rounded-[10px] bg-coal-500 px-3 py-1.5 text-[12.5px] font-semibold text-chalk-100 hover:bg-coal-400"
                    >
                      Details <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => decide(a, true)} className="flex items-center gap-1 rounded-[10px] bg-emerald-500/15 px-3 py-1.5 text-[12.5px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button onClick={() => decide(a, false)} className="flex items-center gap-1 rounded-[10px] bg-rose-500/15 px-3 py-1.5 text-[12.5px] font-semibold text-rose-300 transition hover:bg-rose-500/25">
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                </div>
                </Cell>
              ))}
            </Deck>
          </section>
          </Cell>
        ) : null}
      </Deck>
    </PageShell>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
  spark,
}: {
  label: string;
  value: number;
  hint: string;
  tone: string;
  spark?: number[];
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
      <div className="text-[13px] font-medium text-chalk-400">{label}</div>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-[38px] font-extrabold leading-none tracking-[-0.02em] text-chalk-100">
          {value}
        </span>
        {spark && spark.length > 0 ? (
          <Sparkline values={spark} tone={sparkTone(tone)} width={120} height={36} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE_COLOR[tone] }} />
        )}
      </div>
      <div className="mt-2 text-[12px] text-chalk-400">{hint}</div>
    </div>
  );
}

export function RunCard({
  run,
  diff,
  onOpen,
}: {
  run: RunState;
  diff?: { insertions: number; deletions: number };
  onOpen: () => void;
}) {
  const meta = statusMeta(run.status);
  const label = run.displayName || run.task;
  const active = isActive(run.status);
  return (
    <div className="fade-up rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[meta.tone] }} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-chalk-100">{label}</span>
        <span className="shrink-0 text-meta text-chalk-400">{relTime(run.updatedAt)}</span>
      </div>
      {active ? (
        <div className="mt-2.5">
          <div className="mb-1.5 text-[12.5px] font-medium text-chalk-300">{statusMessage(run.status)}</div>
          <PhaseRail status={run.status} />
          {run.branchName || diff ? (
            <div className="mt-2 flex items-center gap-2 text-meta text-chalk-400">
              {run.branchName ? <span className="truncate font-mono">{run.branchName}</span> : null}
              {diff ? (
                <span className="ml-auto shrink-0 font-mono">
                  <span className="text-emerald-400">+{diff.insertions}</span>{" "}
                  <span className="text-rose-300">-{diff.deletions}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2 text-meta text-chalk-400">
          <span className="rounded-[6px] bg-coal-500 px-2 py-0.5 font-medium" style={{ color: TONE_COLOR[meta.tone] }}>
            {meta.label}
          </span>
          {run.branchName ? (
            <span className="truncate font-mono text-meta">{run.branchName}</span>
          ) : null}
          {diff ? (
            <span className="ml-auto shrink-0 font-mono text-meta">
              <span className="text-emerald-400">+{diff.insertions}</span>{" "}
              <span className="text-rose-300">-{diff.deletions}</span>
            </span>
          ) : null}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onOpen} className="flex items-center gap-1.5 rounded-[10px] bg-coal-500 px-3 py-1.5 text-[12.5px] font-semibold text-chalk-100 hover:bg-coal-400">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {active ? (
          <RunActions runId={run.runId} status={run.status} pauseRequested={run.pauseRequested} />
        ) : null}
      </div>
    </div>
  );
}
