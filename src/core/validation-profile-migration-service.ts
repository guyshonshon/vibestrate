import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ensureDir,
  pathExists,
  readDirSafe,
  readText,
  writeText,
} from "../utils/fs.js";
import {
  amacoRoot,
  projectRunsDir,
  runDir,
} from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import type { ProjectConfig } from "../project/config-schema.js";

export type MigrationScope =
  | { kind: "recent"; limit?: number }
  | { kind: "all" }
  | { kind: "run"; runId: string };

export type AffectedRecord = {
  runId: string;
  kind: "suggestion" | "bundle";
  /** Record id within the file. */
  id: string;
  /** Profile name the record currently points at. */
  currentProfile: string;
  /** Resolved next profile ("default" when toProfile is null). */
  nextProfile: string | null;
  /** Path to suggestions.json / suggestion-bundles.json. */
  sourceFile: string;
};

export type MigrationPreview = {
  fromProfile: string;
  toProfile: string | null;
  scope: MigrationScope;
  scannedRuns: number;
  affectedSuggestions: AffectedRecord[];
  affectedBundles: AffectedRecord[];
  malformedFiles: string[];
};

export type MigrationAuditRecord = {
  id: string;
  createdAt: string;
  appliedAt: string | null;
  fromProfile: string;
  toProfile: string | null;
  scope: MigrationScope;
  affectedSuggestions: AffectedRecord[];
  affectedBundles: AffectedRecord[];
  malformedFiles: string[];
  dryRun: boolean;
  appliedBy: string;
};

export class ValidationProfileMigrationError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ValidationProfileMigrationError";
  }
}

const DEFAULT_RECENT_RUNS = 50;
const SAFE_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function migrationsDir(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), "validation-profile-migrations");
}

function validateFromTo(
  fromProfile: string,
  toProfile: string | null,
  config: ProjectConfig,
): void {
  const from = (fromProfile ?? "").trim();
  if (!from) {
    throw new ValidationProfileMigrationError(
      400,
      "fromProfile is required.",
    );
  }
  if (from === "default") {
    throw new ValidationProfileMigrationError(
      400,
      'fromProfile cannot be "default" — the implicit default cannot be renamed or cleared.',
    );
  }
  if (toProfile === null) return;
  const to = toProfile.trim();
  if (!to) {
    throw new ValidationProfileMigrationError(
      400,
      "toProfile must be a non-empty profile name (or null to clear to default).",
    );
  }
  if (to === "default") {
    throw new ValidationProfileMigrationError(
      400,
      'Pass toProfile=null to clear to default; "default" is not a valid named target.',
    );
  }
  const profiles = config.commands.validationProfiles ?? {};
  if (!profiles[to]) {
    throw new ValidationProfileMigrationError(
      404,
      `toProfile "${to}" is not defined in commands.validationProfiles.`,
    );
  }
}

async function listRunsForScope(
  projectRoot: string,
  scope: MigrationScope,
): Promise<string[]> {
  const runsRoot = projectRunsDir(projectRoot);
  if (!(await pathExists(runsRoot))) return [];
  if (scope.kind === "run") {
    if (!SAFE_RUN_ID_RE.test(scope.runId) || scope.runId.includes("..")) {
      throw new ValidationProfileMigrationError(
        400,
        `Unsafe runId: ${scope.runId}`,
      );
    }
    return [scope.runId];
  }
  const all = (await readDirSafe(runsRoot)).sort();
  if (scope.kind === "all") return all;
  const limit = Math.max(1, scope.limit ?? DEFAULT_RECENT_RUNS);
  return all.slice(-limit);
}

async function collectAffectedFile(input: {
  projectRoot: string;
  runId: string;
  filename: "suggestions.json" | "suggestion-bundles.json";
  field: "suggestions" | "bundles";
  fromProfile: string;
  toProfile: string | null;
  out: AffectedRecord[];
  malformed: string[];
  kind: "suggestion" | "bundle";
}): Promise<void> {
  const file = path.join(runDir(input.projectRoot, input.runId), input.filename);
  if (!(await pathExists(file))) return;
  let parsed: unknown;
  try {
    const text = await readText(file);
    parsed = text.trim() ? JSON.parse(text) : null;
  } catch {
    input.malformed.push(file);
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const arr = (parsed as Record<string, unknown>)[input.field];
  if (!Array.isArray(arr)) return;
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as { id?: unknown; validationProfile?: unknown };
    if (rec.validationProfile !== input.fromProfile) continue;
    input.out.push({
      runId: input.runId,
      kind: input.kind,
      id: typeof rec.id === "string" ? rec.id : "(unknown)",
      currentProfile: input.fromProfile,
      nextProfile: input.toProfile,
      sourceFile: file,
    });
  }
}

/**
 * Build a preview of which suggestion + bundle records would change if we
 * migrated `fromProfile` → `toProfile` (or cleared to default when
 * `toProfile === null`). The preview writes **nothing** — callers must call
 * `applyMigration()` separately to persist.
 *
 * Malformed files are surfaced in the result rather than crashing the scan.
 * Scope defaults to the recent 50 runs unless `all` or a specific runId is
 * supplied.
 */
export async function previewMigration(input: {
  projectRoot: string;
  config: ProjectConfig;
  fromProfile: string;
  toProfile: string | null;
  scope?: MigrationScope;
}): Promise<MigrationPreview> {
  const scope: MigrationScope = input.scope ?? { kind: "recent" };
  validateFromTo(input.fromProfile, input.toProfile, input.config);
  const runs = await listRunsForScope(input.projectRoot, scope);

  const suggestions: AffectedRecord[] = [];
  const bundles: AffectedRecord[] = [];
  const malformed: string[] = [];

  for (const runId of runs) {
    await collectAffectedFile({
      projectRoot: input.projectRoot,
      runId,
      filename: "suggestions.json",
      field: "suggestions",
      fromProfile: input.fromProfile,
      toProfile: input.toProfile,
      out: suggestions,
      malformed,
      kind: "suggestion",
    });
    await collectAffectedFile({
      projectRoot: input.projectRoot,
      runId,
      filename: "suggestion-bundles.json",
      field: "bundles",
      fromProfile: input.fromProfile,
      toProfile: input.toProfile,
      out: bundles,
      malformed,
      kind: "bundle",
    });
  }

  return {
    fromProfile: input.fromProfile,
    toProfile: input.toProfile,
    scope,
    scannedRuns: runs.length,
    affectedSuggestions: suggestions,
    affectedBundles: bundles,
    malformedFiles: malformed,
  };
}

/**
 * Apply a previously-previewed migration. Rewrites the matching
 * `validationProfile` fields in each suggestions.json / suggestion-bundles.json
 * file under the chosen scope, then persists an audit record under
 * `.amaco/validation-profile-migrations/<id>.json`.
 *
 * Honours the same safety rules as the preview:
 *   - never modifies historical validation result files
 *   - never touches other fields on the suggestion/bundle record
 *   - tolerates malformed files (records them, leaves them untouched)
 *
 * Returns the audit record so callers can surface the path or read the
 * counts.
 */
export async function applyMigration(input: {
  projectRoot: string;
  config: ProjectConfig;
  fromProfile: string;
  toProfile: string | null;
  scope?: MigrationScope;
}): Promise<MigrationAuditRecord> {
  const preview = await previewMigration(input);
  const auditId = `m-${nowIso().replace(/[:.]/g, "-").replace(/Z$/, "")}-${randomUUID().slice(0, 4)}`;
  const audit: MigrationAuditRecord = {
    id: auditId,
    createdAt: nowIso(),
    appliedAt: null,
    fromProfile: preview.fromProfile,
    toProfile: preview.toProfile,
    scope: preview.scope,
    affectedSuggestions: preview.affectedSuggestions,
    affectedBundles: preview.affectedBundles,
    malformedFiles: preview.malformedFiles,
    dryRun: false,
    appliedBy: "local-user",
  };

  // Group affected records by file so we rewrite each file exactly once.
  const byFile = new Map<
    string,
    {
      field: "suggestions" | "bundles";
      ids: Set<string>;
    }
  >();
  for (const r of preview.affectedSuggestions) {
    const entry = byFile.get(r.sourceFile) ?? {
      field: "suggestions" as const,
      ids: new Set<string>(),
    };
    entry.ids.add(r.id);
    byFile.set(r.sourceFile, entry);
  }
  for (const r of preview.affectedBundles) {
    const entry = byFile.get(r.sourceFile) ?? {
      field: "bundles" as const,
      ids: new Set<string>(),
    };
    entry.ids.add(r.id);
    byFile.set(r.sourceFile, entry);
  }

  for (const [file, info] of byFile) {
    try {
      const text = await readText(file);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const list = parsed[info.field];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const rec = raw as { id?: unknown; validationProfile?: unknown };
        if (typeof rec.id !== "string" || !info.ids.has(rec.id)) continue;
        if (rec.validationProfile !== input.fromProfile) continue;
        rec.validationProfile = input.toProfile;
      }
      await writeText(file, `${JSON.stringify(parsed, null, 2)}\n`);
    } catch {
      // Already counted in malformedFiles via the preview path; skip.
    }
  }

  audit.appliedAt = nowIso();
  await ensureDir(migrationsDir(input.projectRoot));
  await writeText(
    path.join(migrationsDir(input.projectRoot), `${auditId}.json`),
    `${JSON.stringify(audit, null, 2)}\n`,
  );
  return audit;
}

export async function listMigrations(
  projectRoot: string,
): Promise<MigrationAuditRecord[]> {
  const dir = migrationsDir(projectRoot);
  if (!(await pathExists(dir))) return [];
  const entries = (await readDirSafe(dir))
    .filter((n) => n.endsWith(".json"))
    .sort();
  const out: MigrationAuditRecord[] = [];
  for (const name of entries) {
    try {
      const text = await readText(path.join(dir, name));
      out.push(JSON.parse(text) as MigrationAuditRecord);
    } catch {
      // skip corrupt audit file
    }
  }
  return out;
}

/**
 * Small case-insensitive Damerau-style edit distance — good enough to
 * surface obvious typos ("quikc" → "quick") without pulling in a real
 * library. Returns Infinity when names differ in length by more than two,
 * so we never recommend wildly different names.
 */
export function profileEditDistance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (Math.abs(x.length - y.length) > 2) return Number.POSITIVE_INFINITY;
  const m = x.length;
  const n = y.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // delete
        dp[i]![j - 1]! + 1, // insert
        dp[i - 1]![j - 1]! + cost, // substitute
      );
      if (
        i > 1 &&
        j > 1 &&
        x[i - 1] === y[j - 2] &&
        x[i - 2] === y[j - 1]
      ) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
      }
    }
  }
  return dp[m]![n]!;
}

/**
 * Pick the closest known profile name within edit-distance 2, or null when
 * none are close. Used by doctor for "did you mean…?" hints.
 */
export function suggestProfileName(
  unknown: string,
  knownNames: readonly string[],
): string | null {
  if (knownNames.length === 0) return null;
  let best: { name: string; distance: number } | null = null;
  for (const name of knownNames) {
    if (name === unknown) continue;
    const d = profileEditDistance(unknown, name);
    if (d > 2) continue;
    if (!best || d < best.distance) {
      best = { name, distance: d };
    }
  }
  return best?.name ?? null;
}
