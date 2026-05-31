import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeJson } from "../utils/json.js";
import type { RunSpec } from "./run-launcher.js";

/**
 * Resolve the bundled core run entry (`dist/run-entry.js`). The dashboard and
 * the workspace coordinator both drive runs through this entry — never the
 * `vibe` CLI binary — so UI ⇄ CLI stay decoupled and every launch goes through
 * one audited core path.
 */
export function resolveRunEntry(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // bundled: dist/run-entry.js sits a couple dirs up from this module
    path.resolve(here, "..", "..", "dist", "run-entry.js"),
    path.resolve(here, "..", "..", "..", "dist", "run-entry.js"),
    // same dir as the bundled entry
    path.resolve(here, "run-entry.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

/**
 * Start a run as a DETACHED CORE process — `node dist/run-entry.js <specFile>`.
 * The spec is written to a transient file under the target project's
 * `.vibestrate/` (keeps argv short); the entry reads it, deletes it, and runs.
 * Detached + unref'd so the run outlives the request, exactly like a CLI run.
 *
 * `cwd` is pinned to `spec.projectRoot`, so the same primitive launches a run
 * in the served project OR (via the workspace coordinator) in any other
 * registered project root — each run still loads that project's own config,
 * policies, and Action Broker.
 */
export async function startDetachedRun(input: {
  spec: RunSpec;
  spawnedBy: string;
  extraEnv?: Record<string, string>;
}): Promise<number | null> {
  const entry = resolveRunEntry();
  const projectRoot = input.spec.projectRoot;
  const specPath = path.join(
    projectRoot,
    ".vibestrate",
    `.run-spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  await writeJson(specPath, input.spec);
  const child = spawn(process.execPath, [entry, specPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      VIBESTRATE_SPAWNED_BY: input.spawnedBy,
      NO_COLOR: "1",
      ...input.extraEnv,
    },
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  return child.pid ?? null;
}
