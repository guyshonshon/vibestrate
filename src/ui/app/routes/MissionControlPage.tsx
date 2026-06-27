import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  GitBranch,
  LayoutGrid,
  Plus,
  Square,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { streamAllEvents } from "../../lib/aggregateEvents.js";
import { push as pushDesktop } from "../../lib/desktopNotify.js";
import { navigate } from "../App.js";
import { MissionComposer } from "../../components/mission/MissionComposer.js";
import { EntityIcon } from "../../components/design/EntityIcon.js";
import { ThemeToggle } from "../../components/design/ThemeToggle.js";
import { PanelBoard, type RegisteredPanel } from "../../components/layout/PanelBoard.js";
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

const isActive = (s: RunStatus): boolean => ACTIVE_STATUSES.includes(s);

const TONE_COLOR: Record<string, string> = {
  violet: "#a78bfa",
  emerald: "#34d399",
  amber: "#fb923c",
  rose: "#fb7185",
  chalk: "#8c8a96",
};

const STATUS_META: Partial<Record<RunStatus, { tone: string; label: string }>> = {
  merge_ready: { tone: "emerald", label: "merge ready" },
  failed: { tone: "rose", label: "failed" },
  aborted: { tone: "chalk", label: "aborted" },
  waiting_for_approval: { tone: "amber", label: "waiting for approval" },
  paused: { tone: "chalk", label: "paused" },
};

function statusMeta(s: RunStatus): { tone: string; label: string } {
  return STATUS_META[s] ?? { tone: "violet", label: s.replace(/_/g, " ") };
}

function relTime(iso: string): string {
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

function sparkPath(vals: number[]): string {
  if (vals.length === 0) return "";
  const max = Math.max(1, ...vals);
  const w = 156;
  const h = 50;
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  return vals
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`,
    )
    .join(" ");
}

export function MissionControlPage({ onSelectRun }: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [diffByRun, setDiffByRun] = useState<
    Record<string, { insertions: number; deletions: number }>
  >({});
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        await Promise.all(
          r
            .filter((run) => isActive(run.status))
            .map(async (run) => {
              await Promise.all([
                api
                  .getDiff(run.runId)
                  .then((snap) => {
                    if (snap) {
                      diffs[run.runId] = {
                        insertions: snap.totals.insertions,
                        deletions: snap.totals.deletions,
                      };
                    }
                  })
                  .catch(() => undefined),
                api
                  .listApprovals(run.runId)
                  .then((list) => {
                    for (const a of list) {
                      if (a.status === "pending") apr.push({ ...a, runId: run.runId });
                    }
                  })
                  .catch(() => undefined),
              ]);
            }),
        );
        if (cancelled) return;
        setDiffByRun(diffs);
        apr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setApprovals(apr);
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

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

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
  const failed = useMemo(() => runs.filter((r) => r.status === "failed").length, [runs]);

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

  const act = async (kind: "abort" | "pause" | "resume", runId: string) => {
    try {
      if (kind === "abort") await api.abortRun(runId);
      else if (kind === "pause") await api.pauseRun(runId);
      else await api.resumeRun(runId);
      setToast({ kind: "ok", text: `${kind} requested` });
    } catch (err) {
      setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  };
  const decide = async (a: ApprovalRow, approve: boolean) => {
    try {
      if (approve) await api.approveApproval({ runId: a.runId, approvalId: a.id });
      else await api.rejectApproval({ runId: a.runId, approvalId: a.id });
      setToast({ kind: "ok", text: approve ? "approved" : "rejected" });
    } catch (err) {
      setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  };

  // Monitoring widgets, rendered through the movable/resizable/hideable board
  // (PanelBoard, shared with the run dashboard). The composer + approvals stay
  // fixed above the board - they're actions, not rearrangeable widgets.
  const panels: RegisteredPanel[] = [
    {
      id: "overview",
      title: "Overview",
      defaultLayout: { id: "overview", x: 0, y: 0, w: 12, h: 3 },
      minW: 4,
      minH: 2,
      render: () => (
        <div className="grid h-full grid-cols-3 gap-4">
          <StatCard label="Active runs" value={activeRuns.length} hint="in flight" tone="violet" />
          <StatCard label="Merge-ready" value={mergeReady} hint="ready to ship" tone="emerald" />
          <StatCard
            label="Runs this week"
            value={week.total}
            hint="last 7 days"
            tone="violet"
            spark={week.counts}
          />
        </div>
      ),
    },
    {
      id: "active",
      title: "Active runs",
      defaultLayout: { id: "active", x: 0, y: 3, w: 8, h: 6 },
      minW: 4,
      minH: 3,
      render: () => (
        <div className="flex h-full flex-col">
          <h2 className="mb-3 text-[18px] font-bold text-violet-vivid">Active</h2>
          {activeRuns.length === 0 ? (
            <div className="rounded-[22px] border border-[color:var(--line)] bg-coal-600 px-6 py-10 text-center text-[13.5px] text-chalk-400">
              No runs in flight. Launch one with <span className="font-semibold text-chalk-100">New run</span>.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {activeRuns.map((r) => (
                <RunCard
                  key={r.runId}
                  run={r}
                  diff={diffByRun[r.runId]}
                  onOpen={() => navigate({ kind: "control", runId: r.runId })}
                  onAbort={() => act("abort", r.runId)}
                />
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "recent",
      title: "Recent runs",
      defaultLayout: { id: "recent", x: 8, y: 3, w: 4, h: 6 },
      minW: 3,
      minH: 3,
      render: () => (
        <div className="flex h-full flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-violet-vivid">Recent</h2>
            <button onClick={() => navigate({ kind: "runs" })} className="flex items-center gap-1 text-[12.5px] font-semibold text-violet-soft hover:text-violet-soft/80">
              All runs <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {completed.length === 0 ? (
            <div className="rounded-[22px] border border-[color:var(--line)] bg-coal-600 px-6 py-8 text-center text-[13.5px] text-chalk-400">
              Nothing finished yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {completed.map((r) => (
                <RunCard key={r.runId} run={r} onOpen={() => navigate({ kind: "control", runId: r.runId })} />
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="font-jakarta flex min-h-screen bg-coal-800 text-chalk-100">
      <aside className="sticky top-0 flex h-screen w-[230px] shrink-0 flex-col gap-0.5 px-4 py-5">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <span className="h-7 w-7 rounded-[9px] bg-gradient-to-br from-violet-soft to-[#6d4fd4]" />
          <span className="text-[16px] font-extrabold tracking-[-0.01em]">vibestrate</span>
          <ThemeToggle className="ml-auto h-8 w-8 rounded-[10px]" />
        </div>

        <NavItem icon={<LayoutGrid className="h-[18px] w-[18px]" />} label="Dashboard" selected />
        <button className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[14px] font-bold text-chalk-100">
          <EntityIcon entity="run" size={18} />
          <span>Runs</span>
          <ChevronUp className="ml-auto h-4 w-4 text-chalk-400" />
        </button>
        <div className="mb-1 ml-[22px] flex flex-col gap-0.5 border-l-[1.5px] border-[color:var(--line-strong)] pl-2.5">
          <SubItem label="Active" badge={{ n: activeRuns.length, tone: "violet" }} onClick={() => navigate({ kind: "runs" })} />
          <SubItem label="Merge-ready" badge={{ n: mergeReady, tone: "emerald" }} onClick={() => navigate({ kind: "runs" })} />
          <SubItem label="Failed" badge={{ n: failed, tone: "amber" }} onClick={() => navigate({ kind: "runs" })} />
        </div>
        <NavItem
          icon={<EntityIcon entity="crew" size={18} />}
          label="Crew"
          trailing={<ChevronDown className="h-4 w-4 text-chalk-400" />}
          onClick={() => navigate({ kind: "crew", crewId: null })}
        />
        <NavItem icon={<EntityIcon entity="flow" size={18} />} label="Flows" onClick={() => navigate({ kind: "flows" })} />
        <NavItem icon={<GitBranch className="h-[18px] w-[18px]" />} label="Diffs" onClick={() => navigate({ kind: "git-tree" })} />

        <button
          onClick={() => navigate({ kind: "compose" })}
          className="mt-auto flex items-center justify-center gap-2 rounded-[12px] bg-violet-soft px-3 py-2.5 text-[13.5px] font-bold text-coal-900 transition hover:bg-violet-soft/90"
        >
          <Plus className="h-4 w-4" /> New run
        </button>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="w-full px-10 py-7">
        <header className="mb-6">
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">Mission control</h1>
        </header>
        <div className="mb-4">
          <MissionComposer />
        </div>

        {error ? (
          <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
            {error}
          </div>
        ) : null}
        {toast ? (
          <div
            role="status"
            className={`mb-4 rounded-[12px] border px-4 py-2.5 text-[13px] ${
              toast.kind === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-400/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            {toast.text}
          </div>
        ) : null}

        {approvals.length > 0 ? (
          <section className="mb-4 rounded-[22px] border border-amber-soft/25 bg-coal-600 p-6">
            <h2 className="mb-3 text-[18px] font-bold text-violet-vivid">Waiting on you</h2>
            <div className="flex flex-col gap-2.5">
              {approvals.map((a) => (
                <div
                  key={`${a.runId}:${a.id}`}
                  className="flex items-center gap-3 rounded-[14px] bg-coal-500/60 px-4 py-3"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_COLOR.amber }} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{a.reason ?? a.requestedAction ?? "Approval requested"}</span>
                  <button onClick={() => decide(a, true)} className="flex items-center gap-1 rounded-[9px] bg-emerald-500/15 px-3 py-1.5 text-[12.5px] font-semibold text-emerald-400 hover:bg-emerald-500/25">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => decide(a, false)} className="flex items-center gap-1 rounded-[9px] bg-rose-500/15 px-3 py-1.5 text-[12.5px] font-semibold text-rose-300 hover:bg-rose-500/25">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <PanelBoard
          storageKey="mission-control-board"
          variant="bare"
          label="Dashboard layout"
          panels={panels}
        />
        </div>
      </main>
    </div>
  );
}

function NavItem({
  icon,
  label,
  trailing,
  selected,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[14px] font-medium ${
        selected ? "bg-coal-500 font-semibold text-chalk-100" : "text-chalk-400 hover:text-chalk-100"
      }`}
    >
      {icon}
      <span>{label}</span>
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </button>
  );
}

const badgeTone: Record<string, string> = {
  violet: "bg-violet-soft/20 text-violet-soft",
  emerald: "bg-emerald-500/[0.18] text-emerald-400",
  amber: "bg-amber-soft/20 text-amber-soft",
};

function SubItem({
  label,
  badge,
  onClick,
}: {
  label: string;
  badge?: { n: number; tone: keyof typeof badgeTone };
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between rounded-[9px] px-3 py-2 text-left text-[13px] text-chalk-400 hover:text-chalk-100"
    >
      <span>{label}</span>
      {badge ? (
        <span className={`rounded-md px-1.5 py-px text-[11px] font-bold ${badgeTone[badge.tone]}`}>
          {badge.n}
        </span>
      ) : null}
    </button>
  );
}

function StatCard({
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
          <svg viewBox="0 0 156 50" className="h-9 w-[120px]" fill="none" aria-hidden>
            <path d={sparkPath(spark)} stroke={TONE_COLOR[tone]} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE_COLOR[tone] }} />
        )}
      </div>
      <div className="mt-2 text-[12px] text-chalk-400">{hint}</div>
    </div>
  );
}

function RunCard({
  run,
  diff,
  onOpen,
  onAbort,
}: {
  run: RunState;
  diff?: { insertions: number; deletions: number };
  onOpen: () => void;
  onAbort?: () => void;
}) {
  const meta = statusMeta(run.status);
  const label = run.displayName || run.task;
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[meta.tone] }} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-chalk-100">{label}</span>
        <span className="shrink-0 text-[11.5px] text-chalk-400">{relTime(run.updatedAt)}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-chalk-400">
        <span className="rounded-md bg-coal-500 px-2 py-0.5 font-medium" style={{ color: TONE_COLOR[meta.tone] }}>
          {meta.label}
        </span>
        {run.branchName ? (
          <span className="truncate font-mono text-[11px]">{run.branchName}</span>
        ) : null}
        {diff ? (
          <span className="ml-auto shrink-0 font-mono text-[11px]">
            <span className="text-emerald-400">+{diff.insertions}</span>{" "}
            <span className="text-rose-300">-{diff.deletions}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={onOpen} className="flex items-center gap-1.5 rounded-[10px] bg-coal-500 px-3 py-1.5 text-[12.5px] font-semibold text-chalk-100 hover:bg-coal-400">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {onAbort ? (
          <button onClick={onAbort} className="flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold text-rose-300 hover:bg-rose-500/10">
            <Square className="h-3.5 w-3.5" /> Abort
          </button>
        ) : null}
      </div>
    </div>
  );
}
