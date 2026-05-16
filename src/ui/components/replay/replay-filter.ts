// Pure event-list filter for the Replay panel. Lives in its own module
// (no React imports) so it can be unit-tested under the node-environment
// Vitest config.

import type { ReplayEvent, ReplayPhaseKey } from "../../lib/types.js";

export type ReplayFilter = {
  /** Case-insensitive substring against ev.type + " " + ev.message. */
  search: string;
  /**
   * Whitelist of phases to keep. An empty set means "no phase restriction"
   * — events from every phase pass. We treat empty as wildcard rather than
   * "show nothing" so the filter bar's default state ("nothing selected")
   * doesn't accidentally hide every row.
   */
  phases: ReadonlySet<ReplayPhaseKey>;
};

/**
 * Apply the filter and return the matching event indices, in their original
 * order. We deliberately return indices (not events) because the rest of
 * the panel addresses events by `index` and we want deep-links / selection
 * to keep working against the unfiltered projection.
 */
export function filterReplayEvents(
  events: readonly ReplayEvent[],
  filter: ReplayFilter,
): number[] {
  const needle = filter.search.trim().toLowerCase();
  const restrictByPhase = filter.phases.size > 0;
  const out: number[] = [];
  for (const ev of events) {
    if (restrictByPhase && !filter.phases.has(ev.phaseKey)) continue;
    if (needle.length > 0) {
      const hay = (ev.type + " " + ev.message).toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(ev.index);
  }
  return out;
}
