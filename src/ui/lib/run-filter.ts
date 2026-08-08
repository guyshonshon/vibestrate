import type { RunState, RunStatus } from "./types.js";

/**
 * The run-list filter vocabulary, and the predicates behind it.
 *
 * One source of truth on purpose. The sidebar's "Active 3" badge and the Runs
 * page's filtered list have to agree, and they were previously two copies of
 * the same status array in two files - a count that says 3 over a list that
 * shows 4 is worse than either number alone.
 */
export const RUN_FILTERS = ["active", "merge-ready", "failed"] as const;

export type RunFilter = (typeof RUN_FILTERS)[number];

export function isRunFilter(value: string | null | undefined): value is RunFilter {
  return !!value && (RUN_FILTERS as readonly string[]).includes(value);
}

/** In flight, or stopped somewhere a human is expected to act. */
const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  "planning",
  "planned",
  "architecting",
  "architected",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "waiting_for_approval",
  "paused",
]);

export function isActiveStatus(status: RunStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function matchesRunFilter(run: RunState, filter: RunFilter): boolean {
  switch (filter) {
    case "active":
      return isActiveStatus(run.status);
    case "merge-ready":
      return run.status === "merge_ready";
    case "failed":
      return run.status === "failed";
  }
}

export function countByFilter(runs: RunState[], filter: RunFilter): number {
  return runs.reduce((n, r) => (matchesRunFilter(r, filter) ? n + 1 : n), 0);
}

/** The heading a filtered list uses, and the empty state's subject. */
export const RUN_FILTER_LABEL: Record<RunFilter, string> = {
  active: "Active",
  "merge-ready": "Merge-ready",
  failed: "Failed",
};
