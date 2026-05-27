import type { RuntimeMetrics } from "../../lib/types.js";

function fmtCost(usd: number | null): string {
  if (usd === null || usd === undefined) return "—";
  return `$${usd.toFixed(4)}`;
}

function fmtTokens(t: RuntimeMetrics["roles"][number]["tokenUsage"]): string {
  if (!t) return "—";
  const parts: string[] = [];
  if (t.input !== undefined) parts.push(`in ${t.input}`);
  if (t.output !== undefined) parts.push(`out ${t.output}`);
  return parts.length > 0 ? parts.join(" / ") : "—";
}

export function MetricsDashboard({ metrics }: { metrics: RuntimeMetrics | null }) {
  if (!metrics) {
    return (
      <div className="rounded border border-amaco-border bg-amaco-panel p-3 text-[12px] text-amaco-fg-muted">
        Metrics will appear once the first agent finishes.
      </div>
    );
  }

  // Only show totals the run actually produced — empty cells like
  // "duration 0ms" or "cost —" add noise without information.
  const totals: { label: string; value: string }[] = [];
  if (metrics.totalDurationMs > 0)
    totals.push({ label: "duration", value: `${metrics.totalDurationMs}ms` });
  if (metrics.totalProviderCalls > 0)
    totals.push({
      label: "agent calls",
      value: String(metrics.totalProviderCalls),
    });
  if (metrics.reviewLoopCount > 0)
    totals.push({
      label: "review loops",
      value: String(metrics.reviewLoopCount),
    });
  if (metrics.totalCostUsd !== null && metrics.totalCostUsd !== undefined)
    totals.push({ label: "total cost", value: fmtCost(metrics.totalCostUsd) });
  if (metrics.validationSummary)
    totals.push({
      label: "validation",
      value: `${metrics.validationSummary.passed}/${metrics.validationSummary.total} passed`,
    });

  return (
    <div className="rounded border border-amaco-border bg-amaco-panel">
      <header className="flex items-center justify-between border-b border-amaco-border px-3 py-2 text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        <span>metrics</span>
        <span className="amaco-mono normal-case tracking-normal">
          run {metrics.runId}
        </span>
      </header>
      {totals.length === 0 ? (
        <div className="px-3 py-2 text-[11.5px] text-amaco-fg-muted">
          No totals reported yet — the provider hasn't returned cost or
          token usage for this run.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2 text-[12px] sm:grid-cols-5">
          {totals.map((t) => (
            <div key={t.label}>
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
                {t.label}
              </div>
              <div className="amaco-mono text-amaco-fg">{t.value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto border-t border-amaco-border-soft">
        <table className="w-full text-[12px]">
          <thead className="bg-amaco-panel-2 text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Stage</th>
              <th className="px-3 py-1.5 text-left font-medium">Agent</th>
              <th className="px-3 py-1.5 text-left font-medium">Provider</th>
              <th className="px-3 py-1.5 text-left font-medium">Context</th>
              <th className="px-3 py-1.5 text-right font-medium">Duration</th>
              <th className="px-3 py-1.5 text-right font-medium">Exit</th>
              <th className="px-3 py-1.5 text-right font-medium">Diff (+/-)</th>
              <th className="px-3 py-1.5 text-right font-medium">Cost</th>
              <th className="px-3 py-1.5 text-right font-medium">Tokens</th>
              <th className="px-3 py-1.5 text-left font-medium">Skills</th>
              <th className="px-3 py-1.5 text-left font-medium">Decision</th>
            </tr>
          </thead>
          <tbody>
            {metrics.roles.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-2 text-[12px] text-amaco-fg-muted"
                >
                  No agent metrics yet.
                </td>
              </tr>
            ) : (
              metrics.roles.map((a, i) => (
                <tr
                  key={`${a.roleId}-${i}`}
                  className="border-t border-amaco-border-soft"
                >
                  <td className="amaco-mono px-3 py-1.5 text-amaco-fg-dim">
                    {a.stageId}
                  </td>
                  <td className="px-3 py-1.5 text-amaco-fg">{a.roleId}</td>
                  <td className="amaco-mono px-3 py-1.5 text-amaco-fg-dim">
                    {a.providerType}:{a.providerId}
                  </td>
                  <td
                    className="amaco-mono px-3 py-1.5 text-amaco-fg-dim"
                    title={a.guideContextFallbackReason ?? undefined}
                  >
                    {a.guideContextMode
                      ? `${a.guideSlotId ?? "guide"}:${a.guideContextMode}`
                      : a.sessionId
                        ? "session"
                        : "—"}
                  </td>
                  <td className="amaco-mono px-3 py-1.5 text-right text-amaco-fg">
                    {a.durationMs}ms
                  </td>
                  <td
                    className={`amaco-mono px-3 py-1.5 text-right ${
                      a.exitCode === 0 ? "text-amaco-fg-dim" : "text-amaco-fail"
                    }`}
                  >
                    {a.exitCode}
                  </td>
                  <td className="amaco-mono px-3 py-1.5 text-right text-amaco-fg-dim">
                    {a.diffInsertionsAfter !== null && a.diffDeletionsAfter !== null
                      ? `+${a.diffInsertionsAfter} −${a.diffDeletionsAfter}`
                      : "—"}
                  </td>
                  <td className="amaco-mono px-3 py-1.5 text-right text-amaco-fg-dim">
                    {a.totalCostUsd !== null
                      ? `$${a.totalCostUsd.toFixed(4)}`
                      : "—"}
                  </td>
                  <td className="amaco-mono px-3 py-1.5 text-right text-amaco-fg-dim">
                    {fmtTokens(a.tokenUsage)}
                  </td>
                  <td className="amaco-mono px-3 py-1.5 text-amaco-fg-dim">
                    {a.skillsAttached.length > 0
                      ? a.skillsAttached.join(", ")
                      : "—"}
                  </td>
                  <td className="amaco-mono px-3 py-1.5 text-amaco-fg-dim">
                    {a.reviewDecision ?? a.verificationDecision ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-amaco-border-soft px-3 py-2 text-[11px] text-amaco-fg-muted">
        Tokens and cost are reported only when the provider exposes them.
        Generic CLIs show "—".
      </footer>
    </div>
  );
}
