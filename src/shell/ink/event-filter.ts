// Pure event-filter for the Runs page event tail. Filters by case-
// insensitive substring against `event.type + " " + event.message`.
// Empty query is a no-op so the caller doesn't have to special-case it.

import type { ShellEvent } from "../shell-snapshot.js";

export type FilteredEvents = {
  visible: ShellEvent[];
  totalCount: number;
};

export function filterEvents(
  events: ReadonlyArray<ShellEvent>,
  query: string,
): FilteredEvents {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { visible: [...events], totalCount: events.length };
  const visible: ShellEvent[] = [];
  for (const e of events) {
    const hay = `${e.type} ${e.message}`.toLowerCase();
    if (hay.includes(q)) visible.push(e);
  }
  return { visible, totalCount: events.length };
}
