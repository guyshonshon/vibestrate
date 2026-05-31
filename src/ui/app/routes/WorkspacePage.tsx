import { useEffect, useState } from "react";
import { ExternalLink, Folder, RefreshCw } from "lucide-react";
import {
  api,
  type OverviewRange,
  type WorkspaceOverview,
  type WorkspaceProjectSummary,
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
  }, [range]);

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
          <ProjectCard key={p.root} project={p} range={range} />
        ))}
        {overview && overview.projects.length === 0 ? (
          <div className="col-span-full rounded-xl border border-white/[0.06] bg-white/[0.015] py-10 text-center text-[12.5px] text-fog-400">
            No projects registered yet. Run <span className="mono">vibe ui</span> in a
            project, or <span className="mono">vibe workspace add</span>.
          </div>
        ) : null}
      </section>
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
}: {
  project: WorkspaceProjectSummary;
  range: OverviewRange;
}) {
  const { window: w } = project;
  const reachable = !project.current && project.lastPort;
  const successPct =
    w.successRate !== null ? `${Math.round(w.successRate * 100)}%` : "—";

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

      {/* footer */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10.5px] text-fog-500">
          {project.lastActivityAt
            ? `last active ${relTime(project.lastActivityAt)}`
            : "no activity"}
        </span>
        {reachable ? (
          <button
            type="button"
            onClick={() => window.open(`http://localhost:${project.lastPort}/`, "_blank")}
            className="text-[11.5px] text-violet-soft hover:text-violet-200 flex items-center gap-1.5"
          >
            Open dashboard
            <ExternalLink className="h-3 w-3" strokeWidth={1.7} />
          </button>
        ) : project.current ? (
          <span className="text-[10.5px] text-fog-500">you are here</span>
        ) : (
          <span className="text-[10.5px] text-fog-600">not running</span>
        )}
      </div>
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
