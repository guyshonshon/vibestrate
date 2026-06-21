// ── Screen-aware orb: the view-context store ─────────────────────────────────
//
// A tiny module-level store: a screen PUBLISHES a typed snapshot of its
// meaningful state, and the consult orb READS the current snapshot on-demand
// (reactive only - used when the user asks). V1 publisher: the spec-up-questions
// screen. The snapshot is a typed projection of state the client already holds -
// NOT a DOM/screenshot scraper. Secrets are redacted server-side by consult.

import { useEffect } from "react";

export type ViewContextSnapshot = {
  /** Short screen label, e.g. "Spec-up questions". */
  screen: string;
  /** Human-readable serialization of the screen's state. */
  details: string;
};

let current: ViewContextSnapshot | null = null;

/** Read the current screen snapshot (the orb calls this when the user asks). */
export function getViewContext(): ViewContextSnapshot | null {
  return current;
}

/** Set/clear the current snapshot (publishers call this). */
export function setViewContext(snapshot: ViewContextSnapshot | null): void {
  current = snapshot;
}

/**
 * Publish a screen snapshot for as long as the component is mounted, clearing it
 * on unmount. Pass `null` to publish nothing. `details` is the dependency so the
 * snapshot tracks live state (answers typed, field focused).
 */
export function usePublishViewContext(snapshot: ViewContextSnapshot | null): void {
  const screen = snapshot?.screen ?? "";
  const details = snapshot?.details ?? "";
  useEffect(() => {
    setViewContext(snapshot && details ? { screen, details } : null);
    return () => setViewContext(null);
  }, [screen, details, snapshot]);
}
