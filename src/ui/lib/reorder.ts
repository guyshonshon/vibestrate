/**
 * Compute the new id order when a dragged item is dropped onto the slot
 * currently occupied by `targetId`. Pure so it can be unit-tested without a
 * DOM — the drag event wiring in the component is the only untested glue.
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
