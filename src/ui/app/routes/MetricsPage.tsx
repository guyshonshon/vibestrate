import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { api, type MetricsOverview, type OverviewRange } from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { HeroNumber } from "./page-skeletons.js";
import { PanelBoard, type RegisteredPanel } from "../../components/layout/PanelBoard.js";
import { ErrorView } from "../../lib/error-view.js";
import { cn } from "../../components/design/cn.js";
import { CARD } from "../../components/metrics/panelChrome.js";
import { KpiStrip, SPEND_CAP_ANCHOR } from "../../components/metrics/KpiStrip.js";
import { BudgetControl } from "../../components/metrics/BudgetControl.js";
import { RunsPanel } from "../../components/metrics/RunsPanel.js";
import { OutcomesDonut } from "../../components/metrics/OutcomesDonut.js";
import { SpendByRolePanel } from "../../components/metrics/SpendByRolePanel.js";
import { LatencyByPhasePanel } from "../../components/metrics/LatencyByPhasePanel.js";
import { ActivityHeatmapPanel } from "../../components/metrics/ActivityHeatmap.js";
import { PerModelPanel } from "../../components/metrics/PerModelPanel.js";
import { TokensByRolePanel } from "../../components/metrics/TokensByRolePanel.js";
import { LeaderboardTable } from "../../components/metrics/LeaderboardTable.js";

const RANGES: OverviewRange[] = ["24h", "7d", "30d", "90d"];

/**
 * The card a board panel lives in. The board hands every panel a sized box, so
 * the card has to fill it (a short card in a tall frame reads as a rendering
 * bug) and content that outgrows the box scrolls inside the card rather than
 * spilling past its border.
 *
 * Panels that already carry their own card - the spend cap and the leaderboard -
 * skip this and stretch themselves.
 */
function BoardCard({ children }: { children: ReactNode }) {
  return <div className={cn(CARD, "h-full overflow-auto")}>{children}</div>;
}

export function MetricsPage() {
  const [range, setRange] = useState<OverviewRange>("7d");
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.getMetricsOverview(range);
      setOverview(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [range]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load]);

  const exportCsv = () => {
    if (!overview) return;
    const lines: string[] = [];
    lines.push("section,key,value");
    for (const d of overview.daily) {
      lines.push(
        `daily,${d.date},merged=${d.merged} changes=${d.changes} failed=${d.failed}`,
      );
    }
    for (const s of overview.spendByRole) {
      lines.push(`spend,${s.providerId},${s.dollars}`);
    }
    for (const p of overview.phaseLatency) {
      lines.push(`latency,${p.phase},p50=${p.p50} p95=${p.p95}`);
    }
    for (const l of overview.leaderboard) {
      lines.push(
        `leaderboard,${l.providerId},runs=${l.runs} cost=${l.costUsd}`,
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibestrate-metrics-${overview.range}-${overview.generatedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totals = overview?.totals;
  const successPct =
    totals?.successRate !== null && totals?.successRate !== undefined
      ? Math.round(totals.successRate * 100)
      : null;

  // Every metric is a board panel: same registration shape the Dashboard and the
  // run detail board use, so drag, resize, hide/show and reset come from the one
  // system. Defaults reproduce the reading order the page had before it became
  // rearrangeable.
  const panels: RegisteredPanel[] = [
    {
      id: "kpis",
      title: "Headline numbers",
      defaultLayout: { id: "kpis", x: 0, y: 0, w: 12, h: 2 },
      minW: 4,
      minH: 2,
      render: () => <KpiStrip overview={overview} />,
    },
    {
      id: "runs",
      title: "Runs over time",
      defaultLayout: { id: "runs", x: 0, y: 2, w: 8, h: 5 },
      minW: 4,
      minH: 3,
      render: () => (
        <BoardCard>
          <RunsPanel overview={overview} />
        </BoardCard>
      ),
    },
    {
      id: "outcomes",
      title: "Outcomes",
      defaultLayout: { id: "outcomes", x: 8, y: 2, w: 4, h: 5 },
      minW: 3,
      minH: 3,
      render: () => (
        <BoardCard>
          <OutcomesDonut overview={overview} />
        </BoardCard>
      ),
    },
    {
      id: "spend",
      title: "Spend by agent",
      defaultLayout: { id: "spend", x: 0, y: 7, w: 8, h: 5 },
      minW: 4,
      minH: 3,
      render: () => (
        <BoardCard>
          <SpendByRolePanel overview={overview} />
        </BoardCard>
      ),
    },
    {
      id: "latency",
      title: "Latency by phase",
      defaultLayout: { id: "latency", x: 8, y: 7, w: 4, h: 3 },
      minW: 3,
      minH: 2,
      render: () => (
        <BoardCard>
          <LatencyByPhasePanel overview={overview} />
        </BoardCard>
      ),
    },
    {
      id: "budget",
      title: "Spend cap and ceilings",
      defaultLayout: { id: "budget", x: 8, y: 10, w: 4, h: 4 },
      minW: 3,
      minH: 3,
      render: () => (
        <div id={SPEND_CAP_ANCHOR} className="h-full">
          <BudgetControl />
        </div>
      ),
    },
    {
      id: "activity",
      title: "Activity",
      defaultLayout: { id: "activity", x: 0, y: 14, w: 12, h: 7 },
      minW: 4,
      minH: 3,
      render: () => (
        <BoardCard>
          <ActivityHeatmapPanel overview={overview} />
        </BoardCard>
      ),
    },
    {
      id: "per-model",
      title: "Per model",
      defaultLayout: { id: "per-model", x: 0, y: 21, w: 8, h: 5 },
      minW: 4,
      minH: 3,
      render: () => (
        <BoardCard>
          <PerModelPanel overview={overview} />
        </BoardCard>
      ),
    },
    {
      id: "tokens",
      title: "Tokens by role",
      defaultLayout: { id: "tokens", x: 8, y: 21, w: 4, h: 5 },
      minW: 3,
      minH: 3,
      render: () => (
        <BoardCard>
          <TokensByRolePanel overview={overview} />
        </BoardCard>
      ),
    },
    {
      id: "leaderboard",
      title: "Leaderboard",
      defaultLayout: { id: "leaderboard", x: 0, y: 26, w: 12, h: 6 },
      minW: 6,
      minH: 3,
      render: () => <LeaderboardTable overview={overview} />,
    },
  ];

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              // "-" plus "not enough finished runs" is a verdict, and it was
              // being asserted before the window had been read at all.
              value: !overview ? (
                <HeroNumber w={72} />
              ) : successPct === null ? (
                "-"
              ) : (
                `${successPct}%`
              ),
              caption: "Success rate",
              note: !overview
                ? undefined
                : successPct === null
                  ? "Not enough finished runs in this window."
                  : "Merged, over every run that reached a verdict.",
              tone:
                !overview || successPct === null
                  ? "neutral"
                  : successPct >= 70
                    ? "emerald"
                    : successPct >= 40
                      ? "amber"
                      : "rose",
            }}
            title="Metrics"
            actions={
              <>
                <div className="inline-flex items-center gap-1 rounded-[12px] border border-[color:var(--line-strong)] bg-coal-500 p-[3px]">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={cn(
                        "rounded-[9px] px-3 py-1.5 text-[13px] font-semibold transition",
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
                  size="md"
                  onClick={exportCsv}
                  disabled={!overview}
                  iconLeft={<Download className="h-4 w-4" strokeWidth={1.9} />}
                >
                  Export CSV
                </Button>
              </>
            }
          />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView compact err={error} onRetry={() => void load()} />
          </Cell>
        ) : null}

        {/* The board owns its own layout - panels are dragged and resized - so
         * it is one Cell, not a set of them. */}
        <Cell size="full" reason="nested-deck">
          <PanelBoard
            storageKey="metrics-board"
            variant="bare"
            label="Metrics layout"
            panels={panels}
          />
        </Cell>
      </Deck>
    </PageShell>
  );
}
