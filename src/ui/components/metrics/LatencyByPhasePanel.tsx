import type { MetricsOverview } from "../../lib/api.js";
import { LatencyDumbbell } from "./LatencyDumbbell.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";
import { CSS } from "./panelChrome.js";

/** One dumbbell row is 34px tall with an 88px label gutter and a 66px value. */
const DUMBBELL_ROW_H = 34;

export function LatencyByPhasePanel({
  overview,
}: {
  overview: MetricsOverview | null;
}) {
  if (!overview) {
    return (
      <Skeleton label="Loading latency by phase">
        <div className="mb-3 flex items-center justify-between">
          <SkeletonBlock h={13} w={116} />
          <SkeletonBlock tone="text" h={11} w={48} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[88px_1fr_66px] items-center gap-2"
            style={{ height: DUMBBELL_ROW_H }}
          >
            <SkeletonBlock tone="text" h={12} w={`${[72, 56, 84, 62][i]}%`} />
            <SkeletonBlock h={6} w={`${[84, 58, 71, 39][i]}%`} radius={999} />
            <SkeletonBlock tone="text" h={11} w={40} className="justify-self-end" />
          </div>
        ))}
      </Skeleton>
    );
  }
  const data = overview.phaseLatency;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold text-violet-soft">
          Latency by phase
        </h3>
        <span className="text-meta text-chalk-300">seconds</span>
      </div>
      {data.length === 0 ? (
        <EmptyState text="Phase latency lands here after a few runs complete." />
      ) : (
        <>
          <LatencyDumbbell data={data} />
          <div className="mt-2 flex items-center justify-end gap-3 text-meta text-chalk-300">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: CSS.violet }}
              />{" "}
              p50
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: "var(--card)",
                  border: `1.5px solid ${CSS.violet}`,
                }}
              />{" "}
              p95
            </span>
          </div>
        </>
      )}
    </div>
  );
}
