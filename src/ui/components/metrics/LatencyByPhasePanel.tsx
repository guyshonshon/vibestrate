import type { MetricsOverview } from "../../lib/api.js";
import { LatencyDumbbell } from "./LatencyDumbbell.js";
import { EmptyState } from "./EmptyState.js";
import { CSS } from "./panelChrome.js";

export function LatencyByPhasePanel({
  overview,
}: {
  overview: MetricsOverview | null;
}) {
  const data = overview?.phaseLatency ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold text-violet-soft">
          Latency by phase
        </h3>
        <span className="text-[11px] text-chalk-300">seconds</span>
      </div>
      {data.length === 0 ? (
        <EmptyState text="Phase latency lands here after a few runs complete." />
      ) : (
        <>
          <LatencyDumbbell data={data} />
          <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-chalk-300">
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
