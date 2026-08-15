import type { MetricsOverview } from "../../lib/api.js";
import { fmtCost, fmtTokensShort } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";

/** Model / Calls / Tokens / Cost, at the compact row height this table uses. */
const PER_MODEL_COLS = "grid grid-cols-[1.9fr_0.7fr_0.9fr_0.8fr] items-center gap-3";

export function PerModelPanel({ overview }: { overview: MetricsOverview | null }) {
  if (!overview) {
    return (
      <Skeleton label="Loading per-model usage">
        <SkeletonBlock className="mb-3" h={13} w={72} />
        <div className={`${PER_MODEL_COLS} pb-2`}>
          {[46, 40, 44, 38].map((w, c) => (
            <SkeletonBlock key={c} tone="text" h={10} w={`${w}%`} />
          ))}
        </div>
        {[0, 1, 2, 3].map((r) => (
          <div
            key={r}
            className={`${PER_MODEL_COLS} border-t border-[color:var(--line-soft)] py-1.5`}
          >
            <SkeletonBlock tone="text" h={12} w={`${[86, 62, 74, 54][r]}%`} />
            <SkeletonBlock tone="text" h={12} w={34} className="justify-self-end" />
            <SkeletonBlock tone="text" h={12} w={46} className="justify-self-end" />
            <SkeletonBlock tone="text" h={12} w={44} className="justify-self-end" />
          </div>
        ))}
      </Skeleton>
    );
  }
  const rows = overview.perModel;
  return (
    <>
      <h3 className="mb-3 text-[13.5px] font-semibold text-violet-soft">
        Per model
      </h3>
      {rows.length === 0 ? (
        <EmptyState text="No model usage in this window. Calls, tokens and cost land here per model." />
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-meta font-semibold text-chalk-300">
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
