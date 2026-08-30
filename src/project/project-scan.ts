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
  readTodoCounts,
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

/**
 * Refresh ONLY the codebase map, carrying the existing TODO counts through.
 *
 * This is what the automatic run/merge boundary uses. The map is refreshed there
 * because it grounds the next planner turn, so a stale one is actively
 * misleading. The TODO harvest grounds nothing - it is a human review surface,
 * read on demand, and `loadTodoHarvest` already reports when it is stale. Paying
 * a full-tree `git grep` on every single run completion to keep it warm is cost
 * with no consumer, and it measurably loaded the subprocess-heavy end-to-end
 * suites.
 *
 * Reading the existing harvest (one file read, no scan) rather than passing
 * `null` matters: `null` means "not scanned", so skipping it would blank the
 * counts out of the map after every run.
 */
export async function refreshCodebaseMapOnly(
  projectRoot: string,
  generatedAt: string,
): Promise<void> {
  // `readTodoCounts`, not `loadTodoHarvest`: the latter spawns `git rev-parse`
  // for a staleness flag nothing here reads, and `writeCodebaseMap` already pays
  // for its own rev read. Using the full loader would double the git
  // subprocesses on every run completion.
  await writeCodebaseMap(projectRoot, generatedAt, await readTodoCounts(projectRoot));
}
