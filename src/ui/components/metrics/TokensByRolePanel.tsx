import type { MetricsOverview } from "../../lib/api.js";
import { fmtTokensShort } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";

export function TokensByRolePanel({ overview }: { overview: MetricsOverview | null }) {
  const rows = overview?.tokensByRole ?? [];
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  return (
    <>
      <h3 className="mb-3 text-[13.5px] font-semibold text-violet-soft">
        Tokens by role
      </h3>
      {rows.length === 0 ? (
        <EmptyState text="No tokens recorded yet. They accrue as agents run." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.role}>
              <div className="mb-1 flex items-center justify-between text-[11.5px]">
                <span className="text-chalk-100">{r.role}</span>
                <span className="mono text-chalk-300">
                  {fmtTokensShort(r.tokens)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-coal-500">
                <div
                  className="h-full rounded-full bg-violet-soft/70"
                  style={{ width: `${(r.tokens / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
