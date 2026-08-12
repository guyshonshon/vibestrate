import { useCallback, useEffect, useState } from "react";
import { Download, Save } from "lucide-react";
import { api, type MetricsOverview, type OverviewRange } from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { PageShell, Section } from "../../components/layout/PageShell.js";
import { Deck, Cell, Stack } from "../../components/layout/Deck.js";
import { PageHero } from "../../components/layout/PageHero.js";
import { ErrorView } from "../../lib/error-view.js";
import { cn } from "../../components/design/cn.js";
import { CARD } from "../../components/metrics/panelChrome.js";
import { KpiStrip } from "../../components/metrics/KpiStrip.js";
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

  return (
    <PageShell>
      <Deck>
        <Cell size="full" reason="masthead">
          <PageHero
            state={{
              value: successPct === null ? "-" : `${successPct}%`,
              caption: "Success rate",
              note:
                successPct === null
                  ? "Not enough finished runs in this window."
                  : "Merged, over every run that reached a verdict.",
              tone:
                successPct === null
                  ? "neutral"
                  : successPct >= 70
                    ? "emerald"
                    : successPct >= 40
                      ? "amber"
                      : "rose",
            }}
            title="Metrics"
            purpose="What your runs cost, and how long they took."
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
            footer={`Last ${range}, refreshed every 8 seconds. Export saves what is on screen.`}
          />
        </Cell>

        {error ? (
          <Cell size="full" reason="masthead">
            <ErrorView compact err={error} onRetry={() => void load()} />
          </Cell>
        ) : null}

        {/* The KPI strip carries sparklines, which the hero's metric strip
         * cannot - so it stays as its own register rather than being folded in
         * and losing the trend. */}
        <Cell size="full" reason="masthead">
          <KpiStrip overview={overview} />
        </Cell>

        <Cell size="full" reason="nested-deck">
          <Section flush title="Runs and outcomes">
            <Deck>
              <Cell size="wide" className={CARD}>
                <RunsPanel overview={overview} />
              </Cell>
              <Cell size="card" className={CARD}>
                <OutcomesDonut overview={overview} />
              </Cell>
            </Deck>
          </Section>
        </Cell>

        <Cell size="full" reason="nested-deck">
          <Section flush title="Spend and latency">
            <Deck>
              <Cell size="wide" className={CARD}>
                <SpendByRolePanel overview={overview} />
              </Cell>
              {/* Columns of stacks: the spend chart is much taller than the
               * latency panel, and the spend cap is the control that acts on
               * what this section reports - so it rides underneath rather than
               * leaving a void beside it. */}
              <Cell size="card">
                <Stack>
                  <div className={CARD}>
                    <LatencyByPhasePanel overview={overview} />
                  </div>
                  <BudgetControl />
                </Stack>
              </Cell>
            </Deck>
          </Section>
        </Cell>

        <Cell size="full" reason="timeline">
          <Section flush title="Activity">
            <div className={CARD}>
              <ActivityHeatmapPanel overview={overview} />
            </div>
          </Section>
        </Cell>

        <Cell size="full" reason="nested-deck">
          <Section flush title="Token ledger">
            <Deck>
              <Cell size="wide" className={CARD}>
                <PerModelPanel overview={overview} />
              </Cell>
              <Cell size="card" className={CARD}>
                <TokensByRolePanel overview={overview} />
              </Cell>
            </Deck>
          </Section>
        </Cell>

        <Cell size="full" reason="wide-table">
          <Section
            flush
            title="Leaderboard"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={exportCsv}
                disabled={!overview}
                iconLeft={<Save className="h-3.5 w-3.5" strokeWidth={1.9} />}
              >
                Export CSV
              </Button>
            }
          >
            <LeaderboardTable overview={overview} />
          </Section>
        </Cell>
      </Deck>
    </PageShell>
  );
}
