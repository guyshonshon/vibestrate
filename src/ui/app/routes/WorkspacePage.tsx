import { useEffect, useState } from "react";
import {
  ExternalLink,
  Folder,
  ListPlus,
  Play,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  type OverviewRange,
  type WorkspaceActiveRun,
  type WorkspaceOverview,
  type WorkspaceProjectSummary,
  type WorkspaceQueueEntry,
  type WorkspaceRunRequest,
} from "../../lib/api.js";
import type { RunStatus } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { cn } from "../../components/design/cn.js";

const RANGES: OverviewRange[] = ["24h", "7d", "30d", "90d"];

/**
 * "All projects" — the cross-project overview (Multi-project slice c). Reads
 * each registered project's runs (server-side, bounded to each project's
 * `.vibestrate/runs`) and shows a combined rollup + a card per project. The
 * dashboard stays single-project; this is the read-only birds-eye across the
 * registry. Hopping to another project still opens its own dashboard/port.
 */
export function WorkspacePage() {
  const [range, setRange] = useState<OverviewRange>("7d");
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // The project a run is being composed for (Run dialog), or null.
  const [runTarget, setRunTarget] = useState<WorkspaceProjectSummary | null>(null);

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
    <div className="relative z-10 mx-auto max-w-[1480px] px-8 pt-6 pb-16 fade-up">
      {/* ── Hero ─ */}
      <section className="mt-2 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-[720px]">
          <div className="eyebrow mb-1.5">Workspace · every project at once</div>
          <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
            All your{" "}
            <em className="text-display italic text-violet-soft">projects</em>, one view
          </h1>
          <p className="text-fog-300 text-[13px] mt-1.5 max-w-[640px]">
            Runs, outcomes, and spend rolled up across every registered project.
            Read-only — each project still runs on its own dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.025] p-[3px]">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "h-7 px-3 rounded-md text-[12px] font-medium",
                  range === r
                    ? "bg-white/[0.08] text-fog-100"
                    : "text-fog-400 hover:text-fog-100",
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
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
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
            onRun={() => setRunTarget(p)}
            onChanged={reload}
          />
        ))}
        {overview && overview.projects.length === 0 ? (
          <div className="col-span-full rounded-xl border border-white/[0.06] bg-white/[0.015] py-10 text-center text-[12.5px] text-fog-400">
            No projects registered yet. Run <span className="mono">vibe ui</span> in a
            project, or <span className="mono">vibe workspace add</span>.
          </div>
        ) : null}
      </section>

      {/* ── Workspace queue ─ */}
      <WorkspaceQueuePanel onChanged={reload} />

      {runTarget ? (
        <WorkspaceRunDialog
          project={runTarget}
          onClose={() => setRunTarget(null)}
          onDone={() => {
            setRunTarget(null);
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
    <div className="glass p-4">
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
  onRun,
  onChanged,
}: {
  project: WorkspaceProjectSummary;
  range: OverviewRange;
  onRun: () => void;
  onChanged: () => void;
}) {
  const { window: w } = project;
  const reachable = !project.current && project.lastPort;
  const successPct =
    w.successRate !== null ? `${Math.round(w.successRate * 100)}%` : "—";
  const canAct = project.initialized && !project.unreadable;

  return (
    <div className="glass p-5 flex flex-col">
      {/* header */}
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 rounded-md bg-violet-soft/15 ring-1 ring-violet-soft/30 flex items-center justify-center text-violet-soft shrink-0">
          <Folder className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-fog-100 truncate">
              {project.label}
            </span>
            {project.current ? (
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
                current
              </span>
            ) : null}
          </div>
          <div className="mono text-[10.5px] text-fog-500 truncate mt-0.5">
            {project.root}
          </div>
        </div>
        {project.activeRuns > 0 ? (
          <span className="text-[10.5px] rounded-full px-2 py-0.5 bg-violet-soft/10 text-violet-soft ring-1 ring-violet-soft/20 shrink-0 flex items-center gap-1">
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
            : "Not initialized — run vibe init here."}
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
                    STATUS_TONE[r.status] ?? "text-fog-400",
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

      {/* active runs — abort cross-project */}
      {canAct && project.activeRuns > 0 ? (
        <ActiveRunsControl project={project} onChanged={onChanged} />
      ) : null}

      {/* footer */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-fog-500 truncate">
          {project.lastActivityAt
            ? `last active ${relTime(project.lastActivityAt)}`
            : "no activity"}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {reachable ? (
            <button
              type="button"
              onClick={() => window.open(`http://localhost:${project.lastPort}/`, "_blank")}
              className="text-[11.5px] text-fog-300 hover:text-fog-100 flex items-center gap-1.5"
            >
              Dashboard
              <ExternalLink className="h-3 w-3" strokeWidth={1.7} />
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canAct}
            onClick={onRun}
            className="text-[11.5px] text-violet-soft hover:text-violet-200 disabled:text-fog-600 flex items-center gap-1.5"
            title={canAct ? "Start or queue a run here" : "Project not initialized"}
          >
            <Play className="h-3 w-3" strokeWidth={1.7} />
            Run
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lazy-expand a project's non-terminal runs and offer cross-project abort. */
function ActiveRunsControl({
  project,
  onChanged,
}: {
  project: WorkspaceProjectSummary;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<WorkspaceActiveRun[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .getWorkspaceActive(project.root)
      .then((r) => !cancelled && setRuns(r.runs))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [open, project.root]);

  const abort = async (runId: string) => {
    setBusy(runId);
    setErr(null);
    try {
      await api.abortWorkspaceRun(project.root, runId);
      setRuns((prev) => (prev ? prev.filter((r) => r.runId !== runId) : prev));
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-violet-soft hover:text-violet-200"
      >
        {open ? "Hide" : "Manage"} {project.activeRuns} active {project.activeRuns === 1 ? "run" : "runs"}
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5">
          {err ? <div className="text-[11px] text-rose-300">{err}</div> : null}
          {runs === null ? (
            <div className="text-[11px] text-fog-500">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="text-[11px] text-fog-500">No active runs.</div>
          ) : (
            runs.map((r) => (
              <div key={r.runId} className="flex items-center gap-2 text-[11.5px]">
                <span className="mono text-[10px] text-violet-soft w-[88px] truncate">{r.status}</span>
                <span className="text-fog-300 truncate flex-1">{r.task}</span>
                <button
                  type="button"
                  disabled={busy === r.runId}
                  onClick={() => void abort(r.runId)}
                  className="text-rose-300 hover:text-rose-200 disabled:text-fog-600 flex items-center gap-1 shrink-0"
                  title="Abort this run"
                >
                  <Square className="h-2.5 w-2.5" strokeWidth={2} />
                  {busy === r.runId ? "…" : "Abort"}
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
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
    <div className="rounded-md bg-white/[0.02] border border-white/[0.05] py-2">
      <div className={cn("text-[15px] font-semibold num-tabular", valueTone)}>{value}</div>
      <div className="text-[9.5px] uppercase tracking-[0.1em] text-fog-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}

// ── Run composer (start now / add to queue) ────────────────────────────────

function WorkspaceRunDialog({
  project,
  onClose,
  onDone,
}: {
  project: WorkspaceProjectSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [task, setTask] = useState("");
  const [flow, setFlow] = useState("");
  const [effort, setEffort] = useState<"" | "low" | "medium" | "high">("");
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState<"run" | "queue" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const buildReq = (): WorkspaceRunRequest => ({
    project: project.root,
    task: task.trim(),
    effort: effort || null,
    readOnly,
    flow: flow.trim() ? { id: flow.trim() } : null,
  });

  const submit = async (mode: "run" | "queue") => {
    if (!task.trim()) {
      setErr("Describe the task first.");
      return;
    }
    setBusy(mode);
    setErr(null);
    try {
      if (mode === "run") await api.launchWorkspaceRun(buildReq());
      else await api.enqueueWorkspaceRun(buildReq());
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] glass p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow mb-1">Run in another project</div>
            <h3 className="text-[15px] font-semibold text-fog-100 flex items-center gap-2">
              <Folder className="h-4 w-4 text-violet-soft" strokeWidth={1.7} />
              {project.label}
            </h3>
            <div className="mono text-[10.5px] text-fog-500 truncate mt-0.5">{project.root}</div>
          </div>
          <button type="button" onClick={onClose} className="text-fog-500 hover:text-fog-200">
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>

        <label className="block mt-4 text-[11.5px] text-fog-400">Task</label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Describe the change to make…"
          className="mt-1 w-full rounded-md border border-white/10 bg-ink-200/70 px-2.5 py-2 text-[13px] text-fog-100 outline-none focus:border-violet-soft/40 resize-y"
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] text-fog-400">Flow (optional)</label>
            <input
              value={flow}
              onChange={(e) => setFlow(e.target.value)}
              placeholder="e.g. pickup"
              className="mt-1 w-full rounded-md border border-white/10 bg-ink-200/70 px-2.5 py-1.5 text-[12.5px] text-fog-100 outline-none focus:border-violet-soft/40"
            />
          </div>
          <div>
            <label className="block text-[11.5px] text-fog-400">Effort</label>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as typeof effort)}
              className="mt-1 w-full rounded-md border border-white/10 bg-ink-200/70 px-2.5 py-1.5 text-[12.5px] text-fog-100 outline-none focus:border-violet-soft/40"
            >
              <option value="">auto</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[12px] text-fog-300">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
          />
          Read-only (investigation; no apply/validate)
        </label>

        {err ? (
          <div className="mt-3 rounded-md border border-rose-400/30 bg-rose-500/5 px-2.5 py-1.5 text-[12px] text-rose-300">
            {err}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => void submit("queue")}
            iconLeft={<ListPlus className="h-3.5 w-3.5" strokeWidth={1.7} />}
          >
            {busy === "queue" ? "Queuing…" : "Add to queue"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy !== null}
            onClick={() => void submit("run")}
            iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={1.7} />}
          >
            {busy === "run" ? "Starting…" : "Start now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Workspace queue panel ──────────────────────────────────────────────────

function WorkspaceQueuePanel({ onChanged }: { onChanged: () => void }) {
  const [entries, setEntries] = useState<WorkspaceQueueEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api
      .getWorkspaceQueue()
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 10000);
    return () => window.clearInterval(id);
  }, []);

  const drain = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await api.drainWorkspaceQueue();
      setMsg(
        `Launched ${r.launched.length}, skipped ${r.skipped.length}, ${r.remaining} still queued.`,
      );
      load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.removeWorkspaceQueueEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="mt-7 glass p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-1">Workspace queue</div>
          <h2 className="text-[16px] font-semibold text-fog-100">
            {entries.length} pending {entries.length === 1 ? "run" : "runs"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {msg ? <span className="text-[11.5px] text-fog-400">{msg}</span> : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || entries.length === 0}
            onClick={() => void drain()}
            iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={1.7} />}
          >
            {busy ? "Draining…" : "Drain"}
          </Button>
        </div>
      </div>

      {err ? (
        <div className="mt-3 rounded-md border border-rose-400/30 bg-rose-500/5 px-2.5 py-1.5 text-[12px] text-rose-300">
          {err}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <p className="mt-3 text-[12px] text-fog-500">
          Empty. Use a project's <span className="mono">Run → Add to queue</span> (or{" "}
          <span className="mono">vibe workspace queue add</span>) to stage cross-project runs,
          then Drain to launch them within concurrency caps.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className="mono text-[10.5px] text-fog-500 w-[120px] truncate shrink-0">
                {projectLabelOf(e.request.project)}
              </span>
              <span className="text-[12.5px] text-fog-200 truncate flex-1">{e.request.task}</span>
              {e.request.flow ? (
                <span className="mono text-[10px] text-violet-soft shrink-0">
                  flow:{e.request.flow.id}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void remove(e.id)}
                className="text-fog-500 hover:text-rose-300 shrink-0"
                title="Remove from queue"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Basename of a project path (or the label itself if not a path). */
function projectLabelOf(sel: string): string {
  if (!sel.includes("/")) return sel;
  const parts = sel.split("/").filter(Boolean);
  return parts[parts.length - 1] || sel;
}

/** Compact relative time. Pure, no deps. */
function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
