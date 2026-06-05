// Pure topological layering for a Flow's dependency graph (Slice 4 DAG).
// Kept dependency-free so every surface can share one layout: the web
// dashboard (`FlowGraph.tsx`), the `vibe flows show` CLI, and the Ink TUI
// flow page. Steps are placed in longest-path layers; steps that share a
// layer can run concurrently and are drawn side by side, so a review
// panel's fan-out and its arbiter join read the same everywhere.

/** The minimal shape the layout needs from a step. */
export type GraphLayoutStep = {
  id: string;
  needs?: readonly string[];
};

/** True when any step declares a dependency (i.e. the flow is a real graph). */
export function isGraphSteps(steps: { needs?: string[] }[]): boolean {
  return steps.some((s) => (s.needs?.length ?? 0) > 0);
}

// Longest-path layering: layer(step) = 1 + max(layer(need)), roots at 0. The
// graph is validated acyclic upstream, so the memoized walk always terminates
// (the `seen` guard is a belt-and-braces stop for any stray cycle). Generic so
// callers keep their own richer step type (status, labels) in the result.
export function layersOf<T extends GraphLayoutStep>(steps: readonly T[]): T[][] {
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
  const out: T[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const s of steps) out[layer.get(s.id) ?? 0]!.push(s); // flow order within a layer
  return out;
}
