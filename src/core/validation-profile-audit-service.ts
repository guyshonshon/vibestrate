import path from "node:path";
import { readDirSafe, pathExists, readText } from "../utils/fs.js";
import { projectRunsDir, runDir } from "../utils/paths.js";
import type { ProjectConfig } from "../project/config-schema.js";

const DEFAULT_RECENT_RUNS = 50;
const SAFE_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type AuditScope =
  | { kind: "recent"; limit?: number }
  | { kind: "all" }
  | { kind: "run"; runId: string };

export type StaleProfileReference = {
  runId: string;
  /** "suggestion" or "bundle". */
  kind: "suggestion" | "bundle";
  /** Suggestion id or bundle id. */
  id: string;
  /** The profile name the record references. */
  profileName: string;
  /** Path to the file (suggestions.json / suggestion-bundles.json) the record came from. */
  sourceFile: string;
};

export type ProfileAuditResult = {
  /** Scope the audit was actually run with (after defaulting). */
  scope: AuditScope;
  /** Total runs we attempted to scan. */
  scannedRuns: number;
  /** Runs where the suggestions.json or bundles.json file was malformed. */
  malformedFiles: string[];
  /** Suggestion or bundle records whose validationProfile is not declared in commands.validationProfiles. */
  staleSuggestionReferences: StaleProfileReference[];
  staleBundleReferences: StaleProfileReference[];
};

export class ValidationProfileAuditError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ValidationProfileAuditError";
  }
}

/**
 * Walk runs in scope and report any suggestion or bundle whose
 * `validationProfile` does not exist in the project's current
 * commands.validationProfiles map. Tolerant of malformed files: a corrupt
 * suggestions.json is recorded under malformedFiles and never crashes the
 * caller.
 *
 * Scope semantics mirror MigrationScope:
 *  - `recent` (default, 50 runs) — fast feedback for `vibe doctor`
 *  - `all` — full scan, used by `vibe validation profile doctor --all`
 *  - `run` — single run, used for targeted inspection
 *
 * The scan is purely read-only and bounded to the project's `.vibestrate/runs`
 * tree — never reads arbitrary paths.
 */
export async function auditValidationProfileReferences(
  projectRoot: string,
  config: ProjectConfig,
  opts: { scope?: AuditScope } = {},
): Promise<ProfileAuditResult> {
  const scope: AuditScope = opts.scope ?? { kind: "recent" };
  const profiles = new Set(
    Object.keys(config.commands.validationProfiles ?? {}),
  );
  const runsDir = projectRunsDir(projectRoot);
  if (!(await pathExists(runsDir))) {
    return {
      scope,
      scannedRuns: 0,
      malformedFiles: [],
      staleSuggestionReferences: [],
      staleBundleReferences: [],
    };
  }

  const ids = await listRunsForScope(runsDir, scope);

  const malformedFiles: string[] = [];
  const staleSuggestions: StaleProfileReference[] = [];
  const staleBundles: StaleProfileReference[] = [];

  for (const id of ids) {
    await scanSuggestions(
      projectRoot,
      id,
      profiles,
      staleSuggestions,
      malformedFiles,
    );
    await scanBundles(
      projectRoot,
      id,
      profiles,
      staleBundles,
      malformedFiles,
    );
  }

  return {
    scope,
    scannedRuns: ids.length,
    malformedFiles,
    staleSuggestionReferences: staleSuggestions,
    staleBundleReferences: staleBundles,
  };
}

async function listRunsForScope(
  runsDir: string,
  scope: AuditScope,
): Promise<string[]> {
  if (scope.kind === "run") {
    if (!SAFE_RUN_ID_RE.test(scope.runId) || scope.runId.includes("..")) {
      throw new ValidationProfileAuditError(
        400,
        `Unsafe runId: ${scope.runId}`,
      );
    }
    // Only return the runId if it actually exists — otherwise the audit
    // reports scannedRuns:0 rather than throwing.
    const all = await readDirSafe(runsDir);
    return all.includes(scope.runId) ? [scope.runId] : [];
  }
  // Sort lexicographically — run ids embed an ISO-ish timestamp prefix, so
  // the tail is the newest. `all` keeps everything; `recent` slices.
  const all = (await readDirSafe(runsDir)).sort();
  if (scope.kind === "all") return all;
  const limit = Math.max(1, scope.limit ?? DEFAULT_RECENT_RUNS);
  return all.slice(-limit);
}

async function scanSuggestions(
  projectRoot: string,
  runId: string,
  profiles: Set<string>,
  out: StaleProfileReference[],
  malformed: string[],
): Promise<void> {
  const file = path.join(runDir(projectRoot, runId), "suggestions.json");
  if (!(await pathExists(file))) return;
  let parsed: unknown;
  try {
    const text = await readText(file);
    parsed = text.trim() ? JSON.parse(text) : { suggestions: [] };
  } catch {
    malformed.push(file);
    return;
  }
  // Defensive: only walk records that look like suggestions. We don't run
  // schema parsing here — old files with missing fields should still be
  // scanned for staleness without throwing.
  const list = (parsed as { suggestions?: unknown[] })?.suggestions;
  if (!Array.isArray(list)) return;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as { id?: unknown; validationProfile?: unknown };
    const profile = rec.validationProfile;
    if (typeof profile !== "string" || !profile.trim()) continue;
    if (profile === "default") continue;
    if (profiles.has(profile)) continue;
    out.push({
      runId,
      kind: "suggestion",
      id: typeof rec.id === "string" ? rec.id : "(unknown)",
      profileName: profile,
      sourceFile: file,
    });
  }
}

async function scanBundles(
  projectRoot: string,
  runId: string,
  profiles: Set<string>,
  out: StaleProfileReference[],
  malformed: string[],
): Promise<void> {
  const file = path.join(
    runDir(projectRoot, runId),
    "suggestion-bundles.json",
  );
  if (!(await pathExists(file))) return;
  let parsed: unknown;
  try {
    const text = await readText(file);
    parsed = text.trim() ? JSON.parse(text) : { bundles: [] };
  } catch {
    malformed.push(file);
    return;
  }
  const list = (parsed as { bundles?: unknown[] })?.bundles;
  if (!Array.isArray(list)) return;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as { id?: unknown; validationProfile?: unknown };
    const profile = rec.validationProfile;
    if (typeof profile !== "string" || !profile.trim()) continue;
    if (profile === "default") continue;
    if (profiles.has(profile)) continue;
    out.push({
      runId,
      kind: "bundle",
      id: typeof rec.id === "string" ? rec.id : "(unknown)",
      profileName: profile,
      sourceFile: file,
    });
  }
}
