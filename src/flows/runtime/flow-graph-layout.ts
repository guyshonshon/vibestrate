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

// One zone of a checklist + graph flow (Phase D, custom-workflow-dags.md). The
// flow splits into a prelude (runs once), the per-item band (a DAG repeated once
// per checklist item), and a postlude (runs once). Renderers draw the band
// boundary + its "repeats per item" nature so a reader sees both the parallelism
// AND the iteration - a flat `layersOf` would hide both and falsely draw the
// linear prelude/band-root side by side as if concurrent.
export type FlowZone<T> = {
  kind: "prelude" | "band" | "postlude";
  /** True for the per-item band: it repeats once per checklist item. */
  repeats: boolean;
  layers: T[][];
};

/**
 * Zone a flow around its per-item band. The prelude and postlude are linear
 * (schema-enforced: no `needs` outside the band), so each of their steps is its
 * own sequential layer; the band is laid out as a real DAG (fan-out/join).
 *
 * If the band can't be resolved (no/dangling segment) this returns a single zone
 * via the ordinary `layersOf`, so whole-flow graphs render exactly as before.
 */
export function zonedLayersOf<
  T extends GraphLayoutStep & { sourceStepId?: string },
>(
  steps: readonly T[],
  checklistSegment: { from: string; to: string },
): FlowZone<T>[] {
  const idOf = (s: T) => s.sourceStepId ?? s.id;
  const from = steps.findIndex((s) => idOf(s) === checklistSegment.from);
  const to = steps.findIndex((s) => idOf(s) === checklistSegment.to);
  if (from < 0 || to < from) {
    return [{ kind: "band", repeats: false, layers: layersOf(steps) }];
  }
  const sequential = (slice: readonly T[]): T[][] => slice.map((s) => [s]);
  const zones: FlowZone<T>[] = [];
  const prelude = steps.slice(0, from);
  if (prelude.length) {
    zones.push({ kind: "prelude", repeats: false, layers: sequential(prelude) });
  }
  zones.push({
    kind: "band",
    repeats: true,
    layers: layersOf(steps.slice(from, to + 1)),
  });
  const postlude = steps.slice(to + 1);
  if (postlude.length) {
    zones.push({ kind: "postlude", repeats: false, layers: sequential(postlude) });
  }
  return zones;
}
