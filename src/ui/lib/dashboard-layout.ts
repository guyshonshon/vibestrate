// Pure helpers for applying a user's panel layout to a registered panel list.
// Ported from guify's dashboard prefs (the proven movable/resizable board) so
// the merge logic is unit-testable in isolation and shared across boards.

export type WidgetLayout = { id: string; x: number; y: number; w: number; h: number };

export interface RegisteredWidgetLike {
  id: string;
  defaultLayout: WidgetLayout;
}

/**
 * Resolve the rendered layout for a list of registered panels against the
 * user's stored layout + hidden ids.
 *
 *   1. Stored placements win for panels that are still registered; stored
 *      entries for panels that no longer exist are dropped silently.
 *   2. Registered panels with no stored placement fall back to their
 *      `defaultLayout` (a newly-added panel appears in a sensible spot).
 *   3. Hidden panels are filtered out of the rendered layout entirely.
 */
export function resolveDashboardLayout(
  widgets: RegisteredWidgetLike[],
  stored: WidgetLayout[],
  hidden: string[],
): WidgetLayout[] {
  const storedById = new Map(stored.map((l) => [l.id, l]));
  const hiddenSet = new Set(hidden);
  const out: WidgetLayout[] = [];
  for (const w of widgets) {
    if (hiddenSet.has(w.id)) continue;
    out.push(storedById.get(w.id) ?? w.defaultLayout);
  }
  return out;
}

/**
 * Normalize a layout coming back from the grid (after drag/resize) into the
 * storage shape, dropping entries that no longer match a registered panel so
 * stale state can't pile up.
 */
export function normalizeStoredLayout(
  next: WidgetLayout[],
  widgets: RegisteredWidgetLike[],
): WidgetLayout[] {
  const known = new Set(widgets.map((w) => w.id));
  return next
    .filter((l) => known.has(l.id))
    .map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
}
