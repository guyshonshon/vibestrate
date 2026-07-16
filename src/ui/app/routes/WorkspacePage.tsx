import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Play,
  Power,
  RefreshCw,
  X,
} from "lucide-react";
import {
  api,
  type OverviewRange,
  type WorkspaceBusyStatus,
  type WorkspaceOverview,
  type WorkspaceProjectSummary,
} from "../../lib/api.js";
import type { RunStatus } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { HeroCard, type HeroMetric, type HeroTone } from "../../components/design/HeroCard.js";
import { PageShell, PageHeader } from "../../components/layout/PageShell.js";
import { ErrorView } from "../../lib/error-view.js";
import { cn } from "../../components/design/cn.js";

const RANGES: OverviewRange[] = ["24h", "7d", "30d", "90d"];

/**
 * "All projects" - the cross-project navigator. Each project is an isolated
 * tenant (its own `vibe ui` server + scheduler); this page rolls up a read-only
 * glance across all of them and lets you OPEN any one in a new tab - starting it
 * if it's dormant. It never reaches into another project's state.
 */
export function WorkspacePage() {
  const [range, setRange] = useState<OverviewRange>("7d");
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [closeTarget, setCloseTarget] = useState<WorkspaceProjectSummary | null>(null);

  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const r = await api.getWorkspaceOverview(range);
        if (!cancelled) {
          setOverview(r);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [range, reloadKey]);

  const totals = overview?.totals;

  return (
    <PageShell className="fade-up">
      <PageHeader
        title="All projects"
        actions={
          <>
            {/* Segmented range toggle - the Board's toolbar idiom. */}
            <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-[color:var(--line)] bg-coal-800 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold transition",
                    range === r
                      ? "bg-violet-soft text-coal-900"
                      : "text-chalk-300 hover:text-chalk-100",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRange((r) => r)}
              iconLeft={
                <RefreshCw
                  className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                  strokeWidth={1.9}
                />
              }
            >
              {loading ? "Refreshing" : "Refresh"}
            </Button>
          </>
        }
      >
        <div className="mt-4 rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5">
          <h2 className="text-[15px] font-bold text-chalk-100">
            Every project, one view
          </h2>
          <p className="mt-1.5 max-w-[72ch] text-[13px] leading-[1.55] text-chalk-300">
            A glance across every registered project - each runs on its own
            isolated dashboard + scheduler. Open any one in a new tab; dormant
            ones start on demand.
          </p>
        </div>
      </PageHeader>

      {error ? (
        <ErrorView className="mb-4" compact err={error} onRetry={reload} />
      ) : null}

      {/* ── KPI strip ─ */}
      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Projects" value={(totals?.projects ?? 0).toLocaleString()} sub="registered" />
        <Kpi
          label="Active runs"
          value={(totals?.activeRuns ?? 0).toLocaleString()}
          sub="live right now"
          tone={totals && totals.activeRuns > 0 ? "violet" : "muted"}
        />
        <Kpi
          label={`Runs · ${range}`}
          value={(totals?.windowRuns ?? 0).toLocaleString()}
          sub="in this window"
        />
        <Kpi
          label="Merged"
          value={(totals?.merged ?? 0).toLocaleString()}
          sub={`${totals?.failed ?? 0} failed`}
          tone="emerald"
        />
        <Kpi
          label="Needs testing"
          value={(totals?.needsTesting ?? 0).toLocaleString()}
          sub="flagged for review"
          tone={totals && totals.needsTesting > 0 ? "amber" : "muted"}
        />
        <Kpi
          label="Spend"
          value={`$${(totals?.costUsd ?? 0).toFixed(2)}`}
          sub={`${fmtTokensShort(totals?.tokens ?? 0)} tok`}
          tone="amber"
        />
      </section>

      {/* ── Project cards ─ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {(overview?.projects ?? []).map((p) => (
          <ProjectCard
            key={p.root}
            project={p}
            range={range}
            onClose={() => setCloseTarget(p)}
          />
        ))}
        {overview && overview.projects.length === 0 ? (
          <div className="col-span-full rounded-[18px] border border-[color:var(--line)] bg-coal-600 py-10 text-center text-[12.5px] text-chalk-300">
            No projects registered yet. Run <span className="mono text-chalk-100">vibe ui</span> in a
            project, or <span className="mono text-chalk-100">vibe workspace add</span>.
          </div>
        ) : null}
      </section>

      {closeTarget ? (
        <CloseDialog
          project={closeTarget}
          onCancel={() => setCloseTarget(null)}
          onClosed={() => {
            setCloseTarget(null);
            reload();
          }}
        />
      ) : null}
    </PageShell>
  );
}

function fmtTokensShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "violet" | "emerald" | "amber" | "muted";
}) {
  const valueTone =
    tone === "violet"
      ? "text-violet-soft"
      : tone === "emerald"
        ? "text-emerald-400"
        : tone === "amber"
          ? "text-amber-soft"
          : tone === "muted"
            ? "text-chalk-300"
            : "text-chalk-100";
  return (
    <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="text-[11px] font-semibold text-violet-soft">{label}</div>
      <div className={cn("mt-2 num-tabular text-[26px] font-semibold tracking-tight", valueTone)}>
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-chalk-300">{sub}</div>
    </div>
  );
}

const STATUS_TONE: Partial<Record<RunStatus, string>> = {
  merge_ready: "text-emerald-400",
  failed: "text-rose-300",
  aborted: "text-rose-300/80",
  blocked: "text-amber-soft",
  waiting_for_approval: "text-amber-soft",
  paused: "text-chalk-300",
};

// Project state → the hero's tonal anchor + status word: the project you're
// viewing is emerald ("current"), a running peer is sky ("live"), a shut-down
// peer sits neutral ("dormant").
function projectStatus(project: WorkspaceProjectSummary): {
  tone: HeroTone;
  word: string;
} {
  if (project.current) return { tone: "emerald", word: "current" };
  if (project.live) return { tone: "sky", word: "live" };
  return { tone: "default", word: "dormant" };
}

function ProjectCard({
  project,
  range,
  onClose,
}: {
  project: WorkspaceProjectSummary;
  range: OverviewRange;
  onClose: () => void;
}) {
  const { window: w } = project;
  const successPct =
    w.successRate !== null ? `${Math.round(w.successRate * 100)}%` : "-";
  const { tone, word } = projectStatus(project);

  // The status column's sub-line: a read-warning takes priority, then the live
  // run count (folds the old "N live" chip + the "active" stat tile), else the
  // project's root path so it stays glanceable.
  const statusSub = project.unreadable
    ? "unreadable"
    : !project.initialized
      ? "not initialized"
      : project.activeRuns > 0
        ? `${project.activeRuns} live`
        : "no active runs";

  // Keep the outcome quartet (runs / merged / failed / success) + the spend KPI.
  // HeroCard caps at 5 tiles; `active` folds into the status sub-line above and
  // `needs-test` is dropped (secondary operational nag, see report).
  const metrics: HeroMetric[] = [
    { value: w.runs.toLocaleString(), label: `runs/${range}` },
    {
      value: w.merged.toLocaleString(),
      label: "merged",
      valueClass: "text-emerald-400",
    },
    {
      value: w.failed.toLocaleString(),
      label: "failed",
      valueClass: w.failed > 0 ? "text-rose-300" : undefined,
    },
    { value: successPct, label: "success" },
    { value: `$${w.costUsd.toFixed(2)}`, label: "spend" },
  ];

  return (
    <HeroCard
      size="md"
      tone={tone}
      overline="Project"
      status={word}
      statusSub={statusSub}
      title={project.label}
      sub={<span className="mono truncate">{project.root}</span>}
      metrics={metrics}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate text-[10.5px] text-chalk-400">
            {project.lastActivityAt
              ? `last active ${relTime(project.lastActivityAt)}`
              : "no activity"}
          </span>
          {project.current ? (
            <span className="text-[10.5px] text-chalk-400">you are here</span>
          ) : (
            <div className="flex items-center gap-3">
              {project.live ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-1.5 text-[11.5px] text-chalk-300 hover:text-rose-300"
                  title="Shut down this project's dashboard + scheduler"
                >
                  <Power className="h-3 w-3" strokeWidth={1.7} />
                  Close
                </button>
              ) : null}
              <OpenButton project={project} />
            </div>
          )}
        </div>
      }
    >
      {/* Recent runs - the project's live feel, between headline and metrics. */}
      <div className="border-b border-[color:var(--line-soft)] px-4 py-3">
        <div className="mb-2 text-[11px] font-medium text-violet-soft">
          Recent runs
        </div>
        {project.recentRuns.length === 0 ? (
          <div className="text-[11.5px] text-chalk-400">No runs yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {project.recentRuns.map((r) => (
              <li key={r.runId} className="flex items-center gap-2 text-[11.5px]">
                <span
                  className={cn(
                    "mono w-[92px] shrink-0 truncate text-[10px]",
                    STATUS_TONE[r.status] ?? "text-chalk-300",
                  )}
                >
                  {r.status}
                </span>
                <span className="truncate text-chalk-300">{r.task}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </HeroCard>
  );
}

/** Confirm + perform a project shutdown, surfacing whether it's busy. */
function CloseDialog({
  project,
  onCancel,
  onClosed,
}: {
  project: WorkspaceProjectSummary;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const [status, setStatus] = useState<WorkspaceBusyStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWorkspaceStatus(project.root)
      .then((s) => !cancelled && setStatus(s))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoadingStatus(false));
    return () => {
      cancelled = true;
    };
  }, [project.root]);

  const confirm = async () => {
    setBusyAction(true);
    setErr(null);
    try {
      const r = await api.closeWorkspaceProject(project.root);
      if (r.method === "unreachable") {
        setErr(
          `${project.label} isn't responding and couldn't be confirmed${
            r.pid ? ` - if it's stuck, kill PID ${r.pid} manually` : ""
          }.`,
        );
        setBusyAction(false);
        return;
      }
      onClosed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusyAction(false);
    }
  };

  const busy = status?.busy ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div className="w-full max-w-[460px] rounded-[18px] border border-[color:var(--line)] bg-coal-700 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-chalk-100">
            <Power className="h-4 w-4 text-rose-300" strokeWidth={1.9} />
            Shut down {project.label}?
          </h3>
          <button type="button" onClick={onCancel} className="text-chalk-400 hover:text-chalk-100">
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>

        <p className="mt-3 text-[12.5px] text-chalk-300">
          This stops the project's dashboard server <em>and</em> its scheduler. Any
          in-flight runs keep their on-disk state, but the scheduler will stop
          picking up new work until you open the project again.
        </p>

        {/* busy status */}
        <div className="mt-3 rounded-[12px] border border-[color:var(--line-soft)] bg-coal-500/60 p-3">
          {loadingStatus ? (
            <div className="text-[12px] text-chalk-300">Checking activity…</div>
          ) : busy ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-soft mt-0.5" strokeWidth={1.9} />
              <div className="text-[12px] text-amber-soft/90">
                <div className="font-semibold text-amber-soft">This project is busy.</div>
                <ul className="mt-1 space-y-0.5 text-amber-soft/80">
                  {status && status.activeRuns > 0 ? (
                    <li>- {status.activeRuns} active run{status.activeRuns === 1 ? "" : "s"}</li>
                  ) : null}
                  {status && status.runningTaskIds.length > 0 ? (
                    <li>- {status.runningTaskIds.length} task{status.runningTaskIds.length === 1 ? "" : "s"} running</li>
                  ) : null}
                  {status && status.queueDepth > 0 ? (
                    <li>- {status.queueDepth} queued task{status.queueDepth === 1 ? "" : "s"} waiting</li>
                  ) : null}
                </ul>
                <div className="mt-1.5 text-amber-soft/70">
                  Closing now interrupts the scheduler; in-progress runs are left where they are.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-chalk-300">
              Idle - no active runs or queued tasks. Safe to close.
            </div>
          )}
        </div>

        {err ? (
          <div className="mt-3 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-300">
            {err}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busyAction} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={busy ? "secondary" : "primary"}
            size="sm"
            disabled={busyAction || loadingStatus}
            onClick={() => void confirm()}
            iconLeft={<Power className="h-3.5 w-3.5" strokeWidth={1.7} />}
          >
            {busyAction ? "Closing…" : busy ? "Close anyway" : "Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Open a project's own dashboard in a new tab - starting it if dormant. */
function OpenButton({ project }: { project: WorkspaceProjectSummary }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.openWorkspaceProject(project.root);
      window.open(r.url, "_blank");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !project.initialized;
  return (
    <div className="flex items-center gap-2">
      {err ? <span className="text-[10px] text-rose-300 max-w-[120px] truncate">{err}</span> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => void open()}
        className="flex items-center gap-1.5 text-[11.5px] text-violet-soft hover:text-violet-soft/80 disabled:text-chalk-400"
        title={
          !project.initialized
            ? "Project not initialized"
            : project.live
              ? "Open this project's dashboard"
              : "Start this project and open it"
        }
      >
        {project.live ? (
          <ExternalLink className="h-3 w-3" strokeWidth={1.7} />
        ) : (
          <Play className="h-3 w-3" strokeWidth={1.7} />
        )}
        {busy ? "Starting…" : project.live ? "Open" : "Launch"}
      </button>
    </div>
  );
}

/** Compact relative time. Pure, no deps. */
function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
