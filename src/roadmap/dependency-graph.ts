import type { Task, TaskStatus } from "./roadmap-types.js";

export type DependencyEdge = { from: string; to: string };

export type DependencyGraph = {
  /** task id → set of ids it depends on */
  blockers: Map<string, Set<string>>;
  /** task id → set of ids that depend on it */
  dependents: Map<string, Set<string>>;
  taskById: Map<string, { id: string; title: string; status: TaskStatus }>;
};

const DONE_STATUSES: TaskStatus[] = ["done", "cancelled"];

export function buildDependencyGraph(tasks: readonly Task[]): DependencyGraph {
  const blockers = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  const taskById = new Map<
    string,
    { id: string; title: string; status: TaskStatus }
  >();

  for (const t of tasks) {
    taskById.set(t.id, { id: t.id, title: t.title, status: t.status });
    if (!blockers.has(t.id)) blockers.set(t.id, new Set());
    if (!dependents.has(t.id)) dependents.set(t.id, new Set());
  }

  for (const t of tasks) {
    for (const dep of t.dependencies) {
      blockers.get(t.id)!.add(dep);
      if (!dependents.has(dep)) dependents.set(dep, new Set());
      dependents.get(dep)!.add(t.id);
    }
  }

  return { blockers, dependents, taskById };
}

export type CycleReport = { cyclic: boolean; cycle: string[] };

/**
 * Iterative DFS-based cycle detection. Returns the first cycle found as a
 * list of task ids; an empty cycle list means none.
 */
export function findFirstCycle(graph: DependencyGraph): CycleReport {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.taskById.keys()) color.set(id, WHITE);
  const parent = new Map<string, string | null>();

  for (const start of graph.taskById.keys()) {
    if (color.get(start) !== WHITE) continue;
    const stack: { id: string; iter: Iterator<string> }[] = [];
    color.set(start, GRAY);
    parent.set(start, null);
    stack.push({ id: start, iter: (graph.blockers.get(start) ?? new Set()).values() });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.iter.next();
      if (next.done) {
        color.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const child = next.value;
      // Edges point from a task to its blockers (depends on), so we recurse
      // along those.
      const c = color.get(child);
      if (c === GRAY) {
        // Cycle. Walk parent chain back to `child`.
        const cycle: string[] = [child];
        let cur: string | null = frame.id;
        while (cur !== null && cur !== child) {
          cycle.push(cur);
          cur = parent.get(cur) ?? null;
        }
        cycle.reverse();
        return { cyclic: true, cycle };
      }
      if (c === undefined || c === WHITE) {
        color.set(child, GRAY);
        parent.set(child, frame.id);
        stack.push({
          id: child,
          iter: (graph.blockers.get(child) ?? new Set()).values(),
        });
      }
    }
  }
  return { cyclic: false, cycle: [] };
}

export function getBlockers(graph: DependencyGraph, taskId: string): string[] {
  return [...(graph.blockers.get(taskId) ?? new Set())].sort();
}

export function getDependents(graph: DependencyGraph, taskId: string): string[] {
  return [...(graph.dependents.get(taskId) ?? new Set())].sort();
}

export function getOpenBlockers(
  graph: DependencyGraph,
  taskId: string,
): string[] {
  const out: string[] = [];
  for (const id of graph.blockers.get(taskId) ?? new Set()) {
    const status = graph.taskById.get(id)?.status;
    if (!status) {
      // Unknown dependency — counts as open (but visible).
      out.push(id);
      continue;
    }
    if (!DONE_STATUSES.includes(status)) out.push(id);
  }
  return out.sort();
}

export function isReady(graph: DependencyGraph, taskId: string): boolean {
  return getOpenBlockers(graph, taskId).length === 0;
}

export function listReadyTaskIds(graph: DependencyGraph): string[] {
  const out: string[] = [];
  for (const id of graph.taskById.keys()) {
    if (isReady(graph, id)) out.push(id);
  }
  return out.sort();
}

export type BlockExplanation = {
  taskId: string;
  blockedByMissing: string[];
  blockedByOpenTaskIds: string[];
};

export function explainBlock(
  graph: DependencyGraph,
  taskId: string,
): BlockExplanation {
  const blockers = graph.blockers.get(taskId) ?? new Set();
  const blockedByMissing: string[] = [];
  const blockedByOpenTaskIds: string[] = [];
  for (const id of blockers) {
    const known = graph.taskById.get(id);
    if (!known) blockedByMissing.push(id);
    else if (!DONE_STATUSES.includes(known.status)) blockedByOpenTaskIds.push(id);
  }
  return {
    taskId,
    blockedByMissing: blockedByMissing.sort(),
    blockedByOpenTaskIds: blockedByOpenTaskIds.sort(),
  };
}
