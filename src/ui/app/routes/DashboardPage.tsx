import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ProfileView, RunState } from "../../lib/types.js";
import { Button } from "../../components/design/Button.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { PanelBoard, type RegisteredPanel } from "../../components/layout/PanelBoard.js";
import { ErrorView } from "../../lib/error-view.js";
import { navigate } from "../App.js";
import { isActiveStatus } from "../../lib/run-filter.js";
import { RunCard, StatCard, relTime, statusMeta } from "./MissionControlPage.js";

/**
 * The monitoring half of what used to be one page: a glance at what is running,
 * without a compose form to scroll past. Starting work is not done here - the
 * page takes an `onCompose` callback and renders a button that calls it.
 *
 * The monitoring widgets render through PanelBoard under the storage key
 * "mission-control-board".
 */
export function DashboardPage({ onCompose }: { onCompose: () => void }) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [diffByRun, setDiffByRun] = useState<
    Record<string, { insertions: number; deletions: number }>
  >({});
  const [error, setError] = useState<unknown>(null);
  // Profiles whose model their provider no longer has. Surfaced here because
  // this is the page you glance at: the run that would have failed on one of
  // these has not started yet, and this is the moment to catch it.
  const [brokenProfiles, setBrokenProfiles] = useState<ProfileView[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.listRuns();
        if (cancelled) return;
        setRuns(r);
        setError(null);
        // Advisory: a failed profiles read must not blank the board.
        try {
          const profs = await api.getProfiles();
          if (!cancelled) {
            setBrokenProfiles(
              profs.profiles.filter((p) => p.modelStatus === "unknown-model"),
            );
          }
        } catch {
          /* leave the previous verdict standing */
        }
        const diffs: Record<string, { insertions: number; deletions: number }> = {};
        for (const run of r.filter((x) => isActiveStatus(x.status)).slice(0, 8)) {
          try {
            const d = await api.getDiff(run.runId);
            if (d) diffs[run.runId] = { insertions: d.totals.insertions, deletions: d.totals.deletions };
          } catch {
            /* one run's diff failing must not blank the board */
          }
        }
        if (!cancelled) setDiffByRun(diffs);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    };
    void load();
    const id = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const activeRuns = runs.filter((r) => isActiveStatus(r.status));
  const mergeReady = runs.filter((r) => r.status === "merge_ready").length;
  const completed = [...runs]
    .filter(
      (r) => r.status === "merge_ready" || r.status === "failed" || r.status === "aborted",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);
  const week = weekOf(runs);

  // Monitoring widgets, rendered through PanelBoard below.
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

  const active = runs.filter((r) => isActiveStatus(r.status)).length;

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              value: active,
              caption: active === 1 ? "Run active" : "Runs active",
              note: active
                ? "In flight, or stopped somewhere waiting on you."
                : "Nothing in flight right now.",
              tone: active > 0 ? "violet" : "neutral",
            }}
            title="Dashboard"
            purpose="What is running right now. Every panel can be moved or hidden."
            actions={
              <Button variant="primary" size="sm" onClick={onCompose}>
                New run
              </Button>
            }
            metrics={[
              { value: runs.length, label: "runs on disk" },
              { value: active, label: "active" },
              { value: week.total, label: "this week" },
            ]}
            footer="Drag a panel by its title to rearrange the board."
          />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView compact err={error} />
          </Cell>
        ) : null}

        {brokenProfiles.length > 0 ? (
          <Cell size="full" reason="masthead">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] border border-amber-soft/30 bg-amber-soft/[0.07] px-4 py-3">
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-amber-soft"
                strokeWidth={1.9}
              />
              <span className="text-[13px] font-semibold text-amber-soft">
                {brokenProfiles.length === 1
                  ? "A profile points at a model its provider does not have"
                  : `${brokenProfiles.length} profiles point at models their providers do not have`}
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-chalk-300">
                {brokenProfiles.map((p) => p.id).join(", ")} - any run using{" "}
                {brokenProfiles.length === 1 ? "it" : "them"} fails at launch.
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate({ kind: "profiles" })}
              >
                Fix in Profiles
              </Button>
            </div>
          </Cell>
        ) : null}

        {/* The board owns its own layout - panels are dragged and resized - so
         * it is one Cell, not a set of them. */}
        <Cell size="full" reason="nested-deck">
          <PanelBoard
            storageKey="mission-control-board"
            variant="bare"
            label="Dashboard layout"
            panels={panels}
          />
        </Cell>
      </Deck>
    </PageShell>
  );
}

/** Runs per day over the last seven days, for the overview sparkline. */
function weekOf(runs: RunState[]): { total: number; counts: number[] } {
  const counts = new Array(7).fill(0) as number[];
  const now = Date.now();
  for (const r of runs) {
    const t = Date.parse(r.startedAt);
    if (!Number.isFinite(t)) continue;
    const daysAgo = Math.floor((now - t) / 86_400_000);
    if (daysAgo >= 0 && daysAgo < 7) counts[6 - daysAgo] = (counts[6 - daysAgo] ?? 0) + 1;
  }
  return { total: counts.reduce((a, b) => a + b, 0), counts };
}
