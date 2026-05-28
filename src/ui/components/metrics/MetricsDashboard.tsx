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
      <div className="rounded border border-vibestrate-border bg-vibestrate-panel p-3 text-[12px] text-vibestrate-fg-muted">
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
    <div className="rounded border border-vibestrate-border bg-vibestrate-panel">
      <header className="flex items-center justify-between border-b border-vibestrate-border px-3 py-2 text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        <span>metrics</span>
        <span className="vibestrate-mono normal-case tracking-normal">
          run {metrics.runId}
        </span>
      </header>
      {totals.length === 0 ? (
        <div className="px-3 py-2 text-[11.5px] text-vibestrate-fg-muted">
          No totals reported yet — the provider hasn't returned cost or
          token usage for this run.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2 text-[12px] sm:grid-cols-5">
          {totals.map((t) => (
            <div key={t.label}>
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
                {t.label}
              </div>
              <div className="vibestrate-mono text-vibestrate-fg">{t.value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto border-t border-vibestrate-border-soft">
        <table className="w-full text-[12px]">
          <thead className="bg-vibestrate-panel-2 text-[10.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
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
                  className="px-3 py-2 text-[12px] text-vibestrate-fg-muted"
                >
                  No agent metrics yet.
                </td>
              </tr>
            ) : (
              metrics.roles.map((a, i) => (
                <tr
                  key={`${a.roleId}-${i}`}
                  className="border-t border-vibestrate-border-soft"
                >
                  <td className="vibestrate-mono px-3 py-1.5 text-vibestrate-fg-dim">
                    {a.stageId}
                  </td>
                  <td className="px-3 py-1.5 text-vibestrate-fg">{a.roleId}</td>
                  <td className="vibestrate-mono px-3 py-1.5 text-vibestrate-fg-dim">
                    {a.providerType}:{a.providerId}
                  </td>
                  <td
                    className="vibestrate-mono px-3 py-1.5 text-vibestrate-fg-dim"
                    title={a.flowContextFallbackReason ?? undefined}
                  >
                    {a.flowContextMode
                      ? `${a.flowSlotId ?? "flow"}:${a.flowContextMode}`
                      : a.sessionId
                        ? "session"
                        : "—"}
                  </td>
                  <td className="vibestrate-mono px-3 py-1.5 text-right text-vibestrate-fg">
                    {a.durationMs}ms
                  </td>
                  <td
                    className={`vibestrate-mono px-3 py-1.5 text-right ${
                      a.exitCode === 0 ? "text-vibestrate-fg-dim" : "text-vibestrate-fail"
                    }`}
                  >
                    {a.exitCode}
                  </td>
                  <td className="vibestrate-mono px-3 py-1.5 text-right text-vibestrate-fg-dim">
                    {a.diffInsertionsAfter !== null && a.diffDeletionsAfter !== null
                      ? `+${a.diffInsertionsAfter} −${a.diffDeletionsAfter}`
                      : "—"}
                  </td>
                  <td className="vibestrate-mono px-3 py-1.5 text-right text-vibestrate-fg-dim">
                    {a.totalCostUsd !== null
                      ? `$${a.totalCostUsd.toFixed(4)}`
                      : "—"}
                  </td>
                  <td className="vibestrate-mono px-3 py-1.5 text-right text-vibestrate-fg-dim">
                    {fmtTokens(a.tokenUsage)}
                  </td>
                  <td className="vibestrate-mono px-3 py-1.5 text-vibestrate-fg-dim">
                    {a.skillsAttached.length > 0
                      ? a.skillsAttached.join(", ")
                      : "—"}
                  </td>
                  <td className="vibestrate-mono px-3 py-1.5 text-vibestrate-fg-dim">
                    {a.reviewDecision ?? a.verificationDecision ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-vibestrate-border-soft px-3 py-2 text-[11px] text-vibestrate-fg-muted">
        Tokens and cost are reported only when the provider exposes them.
        Generic CLIs show "—".
      </footer>
    </div>
  );
}
