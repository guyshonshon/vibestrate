import type { MetricsOverview } from "../../lib/api.js";
import { fmtCost, fmtTokensShort } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";

export function PerModelPanel({ overview }: { overview: MetricsOverview | null }) {
  const rows = overview?.perModel ?? [];
  return (
    <>
      <h3 className="mb-3 text-[13.5px] font-semibold text-violet-soft">
        Per model
      </h3>
      {rows.length === 0 ? (
        <EmptyState text="No model usage in this window yet. Once a run completes, its model calls tally here." />
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-chalk-300">
              <th className="pb-2">Model</th>
              <th className="pb-2 text-right">Calls</th>
              <th className="pb-2 text-right">Tokens</th>
              <th className="pb-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.model}
                className="border-t border-[color:var(--line-soft)]"
              >
                <td className="mono max-w-[220px] truncate py-1.5 text-chalk-100">
                  {r.model}
                </td>
                <td className="num-tabular py-1.5 text-right text-chalk-300">
                  {r.calls}
                </td>
                <td className="num-tabular py-1.5 text-right text-chalk-300">
                  {fmtTokensShort(r.tokens)}
                </td>
                <td className="num-tabular py-1.5 text-right text-chalk-100">
                  {fmtCost(r.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
