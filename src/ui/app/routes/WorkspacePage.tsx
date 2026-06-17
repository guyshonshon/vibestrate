import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Folder,
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
    <div className="deep-scene relative z-10 mx-auto max-w-[1520px] px-8 pt-6 pb-16 fade-up">
      {/* ── Hero ─ */}
      <section className="mt-2 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-[720px]">
          <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
            All your{" "}
            <em className="text-display italic text-violet-soft">projects</em>, one view
          </h1>
          <p className="text-fog-300 text-[13px] mt-1.5 max-w-[640px]">
            A glance across every registered project - each runs on its own
            isolated dashboard + scheduler. Open any one in a new tab; dormant
            ones start on demand.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="inline-flex border border-white/[0.08] bg-ink-200 p-[3px]">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "h-7 px-3 text-[12px] font-medium",
                  range === r
                    ? "bg-white/[0.08] text-fog-100"
                    : "text-fog-300 hover:text-fog-100",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRange((r) => r)}
            iconLeft={
              <RefreshCw
                className={cn("h-3 w-3", loading && "animate-spin")}
                strokeWidth={1.7}
              />
            }
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="mt-4 border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {/* ── KPI strip ─ */}
      <section className="mt-7 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
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
      <section className="mt-7 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {(overview?.projects ?? []).map((p) => (
          <ProjectCard
            key={p.root}
            project={p}
            range={range}
            onClose={() => setCloseTarget(p)}
          />
        ))}
        {overview && overview.projects.length === 0 ? (
          <div className="col-span-full slab py-10 text-center text-[12.5px] text-fog-300">
            No projects registered yet. Run <span className="mono">vibe ui</span> in a
            project, or <span className="mono">vibe workspace add</span>.
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
    </div>
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
        ? "text-emerald-300"
        : tone === "amber"
          ? "text-amber-300"
          : tone === "muted"
            ? "text-fog-300"
            : "text-fog-100";
  return (
    <div className="slab p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-2 text-[26px] font-semibold tracking-tight num-tabular", valueTone)}>
        {value}
      </div>
      <div className="text-[11.5px] text-fog-400 mt-0.5">{sub}</div>
    </div>
  );
}

const STATUS_TONE: Partial<Record<RunStatus, string>> = {
  merge_ready: "text-emerald-300",
  failed: "text-rose-300",
  aborted: "text-rose-300/80",
  blocked: "text-amber-300",
  waiting_for_approval: "text-amber-300",
  paused: "text-fog-300",
};

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

  return (
    <div className="slab p-5 flex flex-col">
      {/* header */}
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 bg-violet-soft/15 ring-1 ring-violet-soft/30 flex items-center justify-center text-violet-soft shrink-0">
          <Folder className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-fog-100 truncate">
              {project.label}
            </span>
            {project.current ? (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
                current
              </span>
            ) : (
              <LiveChip live={project.live} />
            )}
          </div>
          <div className="mono text-[10.5px] text-fog-500 truncate mt-0.5">
            {project.root}
          </div>
        </div>
        {project.activeRuns > 0 ? (
          <span className="text-[10.5px] px-2 py-0.5 bg-violet-soft/10 text-violet-soft ring-1 ring-violet-soft/20 shrink-0 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-soft animate-pulse" />
            {project.activeRuns} live
          </span>
        ) : null}
      </div>

      {/* warnings */}
      {!project.initialized || project.unreadable ? (
        <div className="mt-3 text-[11.5px] text-amber-300/90">
          {project.unreadable
            ? "Could not read this project's runs."
            : "Not initialized - run vibe init here."}
        </div>
      ) : null}

      {/* stats grid */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Stat label={`runs/${range}`} value={w.runs.toLocaleString()} />
        <Stat label="merged" value={w.merged.toLocaleString()} tone="emerald" />
        <Stat label="failed" value={w.failed.toLocaleString()} tone={w.failed > 0 ? "rose" : "default"} />
        <Stat label="success" value={successPct} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="active" value={project.activeRuns.toLocaleString()} tone={project.activeRuns > 0 ? "violet" : "default"} />
        <Stat
          label="needs test"
          value={project.needsTesting.toLocaleString()}
          tone={project.needsTesting > 0 ? "amber" : "default"}
        />
        <Stat label="spend" value={`$${w.costUsd.toFixed(2)}`} />
      </div>

      {/* recent runs */}
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex-1">
        <div className="eyebrow mb-2">Recent runs</div>
        {project.recentRuns.length === 0 ? (
          <div className="text-[11.5px] text-fog-500">No runs yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {project.recentRuns.map((r) => (
              <li key={r.runId} className="flex items-center gap-2 text-[11.5px]">
                <span
                  className={cn(
                    "mono text-[10px] shrink-0 w-[92px] truncate",
                    STATUS_TONE[r.status] ?? "text-fog-300",
                  )}
                >
                  {r.status}
                </span>
                <span className="text-fog-300 truncate">{r.task}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* footer */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-fog-500 truncate">
          {project.lastActivityAt
            ? `last active ${relTime(project.lastActivityAt)}`
            : "no activity"}
        </span>
        {project.current ? (
          <span className="text-[10.5px] text-fog-500">you are here</span>
        ) : (
          <div className="flex items-center gap-3">
            {project.live ? (
              <button
                type="button"
                onClick={onClose}
                className="text-[11.5px] text-fog-300 hover:text-rose-300 flex items-center gap-1.5"
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
    </div>
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
      <div className="w-full max-w-[460px] slab p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow mb-1">Close project</div>
            <h3 className="text-[15px] font-semibold text-fog-100 flex items-center gap-2">
              <Power className="h-4 w-4 text-rose-300" strokeWidth={1.7} />
              Shut down {project.label}?
            </h3>
          </div>
          <button type="button" onClick={onCancel} className="text-fog-500 hover:text-fog-200">
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>

        <p className="mt-3 text-[12.5px] text-fog-300">
          This stops the project's dashboard server <em>and</em> its scheduler. Any
          in-flight runs keep their on-disk state, but the scheduler will stop
          picking up new work until you open the project again.
        </p>

        {/* busy status */}
        <div className="mt-3 border border-white/[0.06] bg-ink-200 p-3">
          {loadingStatus ? (
            <div className="text-[12px] text-fog-300">Checking activity…</div>
          ) : busy ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" strokeWidth={1.7} />
              <div className="text-[12px] text-amber-200/90">
                <div className="font-medium text-amber-200">This project is busy.</div>
                <ul className="mt-1 space-y-0.5 text-amber-200/80">
                  {status && status.activeRuns > 0 ? (
                    <li>· {status.activeRuns} active run{status.activeRuns === 1 ? "" : "s"}</li>
                  ) : null}
                  {status && status.runningTaskIds.length > 0 ? (
                    <li>· {status.runningTaskIds.length} task{status.runningTaskIds.length === 1 ? "" : "s"} running</li>
                  ) : null}
                  {status && status.queueDepth > 0 ? (
                    <li>· {status.queueDepth} queued task{status.queueDepth === 1 ? "" : "s"} waiting</li>
                  ) : null}
                </ul>
                <div className="mt-1.5 text-amber-200/70">
                  Closing now interrupts the scheduler; in-progress runs are left where they are.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-fog-300">
              Idle - no active runs or queued tasks. Safe to close.
            </div>
          )}
        </div>

        {err ? (
          <div className="mt-3 border border-rose-400/30 bg-rose-500/5 px-2.5 py-1.5 text-[12px] text-rose-300">
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

function LiveChip({ live }: { live: boolean }) {
  return live ? (
    <span className="text-[10px] px-1.5 py-0.5 bg-violet-soft/10 text-violet-soft ring-1 ring-violet-soft/20 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-violet-soft" />
      live
    </span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.04] text-fog-400 ring-1 ring-white/[0.06]">
      dormant
    </span>
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
        className="text-[11.5px] text-violet-soft hover:text-violet-200 disabled:text-fog-600 flex items-center gap-1.5"
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

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "violet" | "emerald" | "rose" | "amber";
}) {
  const valueTone =
    tone === "violet"
      ? "text-violet-soft"
      : tone === "emerald"
        ? "text-emerald-300"
        : tone === "rose"
          ? "text-rose-300"
          : tone === "amber"
            ? "text-amber-300"
            : "text-fog-100";
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] py-2">
      <div className={cn("text-[15px] font-semibold num-tabular", valueTone)}>{value}</div>
      <div className="text-[9.5px] uppercase tracking-[0.1em] text-fog-500 mt-0.5">
        {label}
      </div>
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
