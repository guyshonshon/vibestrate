import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { amacoRoot } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type ValidationProfileUsageSource = "default" | "named";

export type ValidationProfileUsageEntry = {
  profileName: string;
  source: ValidationProfileUsageSource;
  totalUses: number;
  lastUsedAt: string | null;
  lastRunId: string | null;
  lastSuggestionId: string | null;
  lastBundleId: string | null;
};

export type ValidationProfileUsageReport = {
  entries: ValidationProfileUsageEntry[];
  /** Path of the persisted file, or null when nothing has been recorded yet. */
  filePath: string;
};

function usageFile(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), "validation-profile-usage.json");
}

async function readRaw(
  projectRoot: string,
): Promise<ValidationProfileUsageEntry[]> {
  const file = usageFile(projectRoot);
  if (!(await pathExists(file))) return [];
  try {
    const text = await readText(file);
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    const entries = (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return [];
    return entries.filter(
      (e): e is ValidationProfileUsageEntry =>
        !!e && typeof e === "object" && typeof (e as { profileName?: unknown }).profileName === "string",
    );
  } catch {
    // Corrupt usage file: behave as if nothing recorded. Doctor surfaces
    // the malformed-file warning via the existing audit path; usage counters
    // are best-effort telemetry.
    return [];
  }
}

/**
 * Append/update a usage row for the (profileName, source) tuple. Counts only
 * **actual validation execution attempts** — callers pass either status
 * "passed" or "failed". The no_commands_configured case is documented to NOT
 * count (the caller skips us in that branch).
 *
 * Tolerates a corrupt usage file by treating it as empty; never throws into
 * the validation hot path.
 */
export async function recordValidationProfileUsage(input: {
  projectRoot: string;
  profileName: string;
  source: ValidationProfileUsageSource;
  runId: string;
  suggestionId?: string | null;
  bundleId?: string | null;
}): Promise<void> {
  try {
    const all = await readRaw(input.projectRoot);
    const idx = all.findIndex(
      (e) => e.profileName === input.profileName && e.source === input.source,
    );
    const ts = nowIso();
    if (idx < 0) {
      all.push({
        profileName: input.profileName,
        source: input.source,
        totalUses: 1,
        lastUsedAt: ts,
        lastRunId: input.runId,
        lastSuggestionId: input.suggestionId ?? null,
        lastBundleId: input.bundleId ?? null,
      });
    } else {
      const prev = all[idx]!;
      all[idx] = {
        ...prev,
        totalUses: prev.totalUses + 1,
        lastUsedAt: ts,
        lastRunId: input.runId,
        lastSuggestionId: input.suggestionId ?? prev.lastSuggestionId,
        lastBundleId: input.bundleId ?? prev.lastBundleId,
      };
    }
    await ensureDir(amacoRoot(input.projectRoot));
    await writeText(
      usageFile(input.projectRoot),
      `${JSON.stringify({ entries: all }, null, 2)}\n`,
    );
  } catch {
    // Best-effort telemetry — never break validation because the usage file
    // is unwritable.
  }
}

export async function readUsageReport(
  projectRoot: string,
): Promise<ValidationProfileUsageReport> {
  const entries = await readRaw(projectRoot);
  entries.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.profileName.localeCompare(b.profileName);
  });
  return { entries, filePath: usageFile(projectRoot) };
}
