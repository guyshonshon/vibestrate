/**
 * Compute the new id order when a dragged item is dropped onto the slot
 * currently occupied by `targetId`. Pure so it can be unit-tested without a
 * DOM - the drag event wiring in the component is the only untested glue.
 *
 * Returns a new array (never mutates `ids`). If either id is absent or the
 * drag lands on itself, returns a copy of the original order unchanged.
 */
export function reorderByDrop(
  ids: readonly string[],
  dragId: string,
  targetId: string,
): string[] {
  const next = [...ids];
  if (dragId === targetId) return next;
  const from = next.indexOf(dragId);
  const to = next.indexOf(targetId);
  if (from < 0 || to < 0) return next;
  next.splice(from, 1);
  next.splice(to, 0, dragId);
  return next;
}

/**
 * Reorder `rows` to match a saved id order (a user's drag preference, persisted
 * client-side). Ids missing from `order` - e.g. a provider detected after the
 * preference was saved - keep their original relative position, sorted after
 * the ones the user placed. Stable and non-mutating, so a newly-detected
 * provider slots in predictably instead of jumping to the top.
 */
export function applyOrder<T extends { id: string }>(
  rows: readonly T[],
  order: readonly string[],
): T[] {
  if (order.length === 0) return [...rows];
  const rank = new Map(order.map((id, i) => [id, i]));
  return rows
    .map((row, i) => ({ row, i, rank: rank.get(row.id) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.rank === b.rank ? a.i - b.i : a.rank - b.rank))
    .map((entry) => entry.row);
}
