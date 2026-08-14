// The full `vibe learn` scan: harvest TODOs, then write the codebase map with
// the resulting counts folded in.
//
// This exists as its own module because TWO call sites need the same
// orchestration - `vibe learn` and the automatic refresh at run/merge
// boundaries (`core/context/project-ledger.ts`) - and `core/` must not import
// from `cli/`.
//
// ── Ordering is load-bearing ─────────────────────────────────────────────────
//
// Harvest FIRST, then the map. The dependency runs one way only: the map render
// consumes harvest counts, and the harvest never reads the map. Inverting this
// lets the two artifacts disagree about how many TODOs the repo has.
//
// ── Failure isolation ────────────────────────────────────────────────────────
//
// The harvest gets its own try, never a shared one. At the refresh boundary
// this whole call hangs off recording a run's completion, so a harvest failure
// must not take down the map refresh, which must not take down the run record.
// When the harvest fails the map records `todos: null` - "not scanned" - rather
// than zero counts, because reporting "no TODOs" for a scan that never ran is a
// lie the UI would then repeat.

import { writeCodebaseMap, type CodebaseMap } from "./codebase-map.js";
import {
  writeTodoHarvest,
  todoCountsOf,
  promotableCount,
  type TodosFile,
} from "./todo-harvest.js";

export type ProjectScanResult = {
  map: CodebaseMap;
  markdownPath: string;
  /** null when the TODO harvest failed; the map's `todos` is null to match. */
  harvest: TodosFile | null;
  /** How many harvested TODOs a human could promote (low-signal excluded). */
  promotable: number;
  /** Non-null when the harvest failed. The map still wrote successfully. */
  harvestError: string | null;
};

/**
 * Regenerate every derived project artifact. Throws only if the codebase map
 * itself cannot be written - a TODO harvest failure is degraded to a note on
 * the result, never an exception.
 */
export async function writeProjectScan(
  projectRoot: string,
  generatedAt: string,
): Promise<ProjectScanResult> {
  let harvest: TodosFile | null = null;
  let harvestError: string | null = null;
  try {
    harvest = await writeTodoHarvest(projectRoot, generatedAt);
  } catch (err) {
    harvestError = err instanceof Error ? err.message : String(err);
  }

  const { map, markdownPath } = await writeCodebaseMap(
    projectRoot,
    generatedAt,
    harvest ? todoCountsOf(harvest) : null,
  );

  return {
    map,
    markdownPath,
    harvest,
    promotable: harvest ? promotableCount(harvest) : 0,
    harvestError,
  };
}
