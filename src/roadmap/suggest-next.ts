// ── Suggest-next (Phase 3) ──────────────────────────────────────────────────
//
// A pure ranker over the *backlog* (not the queue): which not-yet-started card
// should you pick up next? Sibling to the scheduler's `pickNextEntry`, but it
// ranks planning candidates rather than queue entries. Ordering:
//   1. dependency-ready first  (all blockers done → can actually start)
//   2. higher priority
//   3. fewer open blockers     (closer to ready)
//   4. older first, then id    (stable, deterministic)
// No I/O — give it the task list, get an ordered list of suggestions back.

import type { Priority, Task, TaskStatus } from "./roadmap-types.js";
import { buildDependencyGraph, getOpenBlockers } from "./dependency-graph.js";

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// "Backlog" = not started, not in flight, not terminal. These are the cards a
// human could choose to start next. Queued/running/review/blocked/failed are
// in-flight or need attention (not "next to start"); done/cancelled are gone.
const BACKLOG_STATUSES = new Set<TaskStatus>(["backlog", "ready"]);

export type Suggestion = {
  taskId: string;
  title: string;
  ready: boolean;
  priority: Priority;
  /** Open (unfinished/unknown) blocker task ids, sorted. */
  openBlockers: string[];
  /** One-line human rationale. */
  reason: string;
};

export function suggestNext(tasks: readonly Task[]): Suggestion[] {
  const graph = buildDependencyGraph(tasks);
  const scored = tasks
    .filter((t) => BACKLOG_STATUSES.has(t.status) && !t.archived)
    .map((task) => {
      const openBlockers = getOpenBlockers(graph, task.id);
      return { task, openBlockers, ready: openBlockers.length === 0 };
    });

  scored.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    const pr = PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority];
    if (pr !== 0) return pr;
    if (a.openBlockers.length !== b.openBlockers.length) {
      return a.openBlockers.length - b.openBlockers.length;
    }
    const ca = a.task.createdAt.localeCompare(b.task.createdAt);
    if (ca !== 0) return ca;
    return a.task.id.localeCompare(b.task.id);
  });

  return scored.map(({ task, openBlockers, ready }) => ({
    taskId: task.id,
    title: task.title,
    ready,
    priority: task.priority,
    openBlockers,
    reason: ready
      ? `ready · ${task.priority} priority`
      : `${task.priority} priority · blocked by ${openBlockers.length} (${openBlockers
          .slice(0, 3)
          .join(", ")}${openBlockers.length > 3 ? "…" : ""})`,
  }));
}
