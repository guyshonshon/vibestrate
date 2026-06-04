// A compact top-down render of a Flow's dependency graph (Slice 4 DAG). Steps
// are placed in topological layers (longest-path); steps that share a layer ran
// (or can run) concurrently and are drawn side by side - so a review panel's
// fan-out and its arbiter join are legible at a glance. Reused for both the
// static flow definition (no status) and a live run (per-step status tint).

export type FlowGraphStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "blocked"
  | "failed"
  | "skipped";

export type FlowGraphStep = {
  id: string;
  label: string;
  kind: string;
  seat?: string | null;
  needs?: string[];
  instructions?: string | null;
  status?: FlowGraphStepStatus | null;
};

const STATUS_DOT: Record<FlowGraphStepStatus, string> = {
  passed: "bg-emerald-400",
  running: "bg-violet-400 animate-pulse",
  blocked: "bg-amber-300",
  failed: "bg-rose-400",
  skipped: "bg-fog-600",
  pending: "bg-fog-600/50",
};

/** True when any step declares a dependency (i.e. the flow is a real graph). */
export function isGraphSteps(steps: { needs?: string[] }[]): boolean {
  return steps.some((s) => (s.needs?.length ?? 0) > 0);
}

// Longest-path layering: layer(step) = 1 + max(layer(need)), roots at 0. The
// graph is validated acyclic upstream, so the memoized walk always terminates.
// Exported for unit testing (the component has no DOM test harness).
export function layersOf(steps: FlowGraphStep[]): FlowGraphStep[][] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const layer = new Map<string, number>();
  const compute = (id: string, seen: Set<string>): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    const needs = byId.get(id)?.needs ?? [];
    const lv = needs.length
      ? 1 + Math.max(...needs.map((n) => (byId.has(n) ? compute(n, seen) : -1)))
      : 0;
    layer.set(id, lv);
    return lv;
  };
  for (const s of steps) compute(s.id, new Set());
  const maxLayer = Math.max(0, ...layer.values());
  const out: FlowGraphStep[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const s of steps) out[layer.get(s.id) ?? 0]!.push(s); // flow order within a layer
  return out;
}

export function FlowGraph({
  steps,
  title = "Graph",
}: {
  steps: FlowGraphStep[];
  title?: string;
}) {
  const layers = layersOf(steps);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-ink-200/30 p-3">
      <div className="eyebrow mb-2">{title}</div>
      <div className="flex flex-col items-stretch gap-1">
        {layers.map((layerSteps, li) => (
          <div key={li}>
            {li > 0 ? (
              <div className="flex justify-center py-0.5">
                <span className="h-3 w-px bg-white/10" />
              </div>
            ) : null}
            <div
              className={
                layerSteps.length > 1
                  ? "flex flex-wrap items-stretch gap-2 rounded-md border border-dashed border-white/10 p-1.5"
                  : "flex flex-wrap items-stretch gap-2"
              }
            >
              {layerSteps.length > 1 ? (
                <span className="self-center px-1 text-[10px] uppercase tracking-wide text-fog-500">
                  parallel ×{layerSteps.length}
                </span>
              ) : null}
              {layerSteps.map((s) => (
                <Node key={s.id} step={s} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ step }: { step: FlowGraphStep }) {
  const status = step.status ?? null;
  const dot = status ? STATUS_DOT[status] : "bg-fog-600/50";
  return (
    <div className="min-w-[132px] flex-1 rounded-md border border-white/[0.06] bg-ink-200/50 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate text-[12px] text-fog-100">{step.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fog-500">
        <span className="mono">{step.kind}</span>
        {step.seat ? (
          <>
            <span>·</span>
            <span className="mono">{step.seat}</span>
          </>
        ) : null}
        {status ? (
          <>
            <span>·</span>
            <span>{status}</span>
          </>
        ) : null}
      </div>
      {step.instructions ? (
        <div
          className="mt-0.5 truncate text-[10.5px] text-fog-400"
          title={step.instructions}
        >
          {step.instructions}
        </div>
      ) : null}
    </div>
  );
}
