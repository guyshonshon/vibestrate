import type { MetricsOverview } from "../../lib/api.js";
import { fmtTokensShort } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";

export function TokensByRolePanel({ overview }: { overview: MetricsOverview | null }) {
  if (!overview) {
    return (
      <Skeleton label="Loading tokens by role">
        <SkeletonBlock className="mb-3" h={13} w={104} />
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between">
                <SkeletonBlock tone="text" h={11} w={`${[26, 20, 32, 24][i]}%`} />
                <SkeletonBlock tone="text" h={11} w={40} />
              </div>
              <SkeletonBlock h={6} w={`${[92, 64, 43, 27][i]}%`} radius={999} />
            </div>
          ))}
        </div>
      </Skeleton>
    );
  }
  const rows = overview.tokensByRole;
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
              <div className="mb-1 flex items-center justify-between text-meta">
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
