// ── Run-start model auto-detection (the "Preparing models" stage) ────────────
//
// Cheap, offline, best-effort: at the start of every run the orchestrator
// probes each configured probe-capable provider's bundled model catalog
// (codex `debug models --bundled` - instant, no network) and refreshes the
// detected cache (providers-detected.json) ONLY when something changed, so the
// model/effort pickers and the run itself use real models without the user
// ever running `vibe provider refresh`.
//
// Never blocks or fails a run: a missing binary, a parse miss, or a slow spawn
// is swallowed; the prior cache (or curated fallback) stands. A hand-authored
// providers-catalog.yml overlay still wins over this cache.

import { execa } from "execa";
import { loadConfig } from "../project/config-loader.js";
import {
  detectProviderModels,
  modelProbeFamily,
} from "./provider-model-detection.js";
import {
  loadDetectedCache,
  writeDetectedCache,
  emptyCache,
  type DetectedCache,
} from "./provider-detected-store.js";
import type { ProviderDetectionRunner } from "./provider-detection.js";

/** Fast, offline spawn seam (short timeout - this is on the run hot path; an
 *  offline `--bundled` read returns in <100ms, so 4s only bails a hung binary). */
const defaultBundledRunner: ProviderDetectionRunner = async (command, args) => {
  const r = await execa(command, args, { reject: false, timeout: 4_000, stdin: "ignore" });
  return {
    exitCode: r.exitCode ?? -1,
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? "",
  };
};

export type AutoDetectSummary = {
  /** Whether the cache was updated (a model/effort set changed). */
  updated: boolean;
  /** One-line detail for the startup stage ("codex: up to date" / "codex: +gpt-5.6"). */
  detail: string;
  perProvider: {
    providerId: string;
    changed: boolean;
    added: string[];
    removed: string[];
    error: string | null;
  }[];
};

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Probe configured providers' bundled catalogs and refresh the detected cache
 * when changed. Pure-ish: spawn seam + `now` are injectable for tests. Returns
 * a summary for the "Preparing models" startup stage. Best-effort by contract -
 * it resolves even when probes fail (errors are per-provider, not thrown).
 */
export async function autoDetectRunModels(input: {
  projectRoot: string;
  runner?: ProviderDetectionRunner;
  now?: string;
}): Promise<AutoDetectSummary> {
  const runner = input.runner ?? defaultBundledRunner;
  const now = input.now ?? new Date().toISOString();
  const perProvider: AutoDetectSummary["perProvider"] = [];

  let config;
  try {
    config = (await loadConfig(input.projectRoot)).config;
  } catch {
    return { updated: false, detail: "no providers", perProvider };
  }

  const probeable = Object.entries(config.providers).filter(
    ([id, c]) => c.type === "cli" && modelProbeFamily(id, c) !== null,
  );
  if (probeable.length === 0) {
    return { updated: false, detail: "nothing to probe", perProvider };
  }

  const cache: DetectedCache = await loadDetectedCache(input.projectRoot).catch(() => emptyCache());
  const next: DetectedCache = { schemaVersion: 1, providers: { ...cache.providers } };
  let updated = false;

  for (const [id, c] of probeable) {
    if (c.type !== "cli") continue;
    const family = modelProbeFamily(id, c);
    if (!family) continue;
    try {
      const { catalog, source } = await detectProviderModels({
        providerId: id,
        command: c.command,
        family,
        runner,
        bundledOnly: true, // run-hot-path: offline + instant, never network
      });
      const prev = cache.providers[id];
      const changed =
        !prev || !sameSet(prev.models, catalog.models) || !sameSet(prev.efforts, catalog.efforts);
      const added = catalog.models.filter((m) => !(prev?.models ?? []).includes(m));
      const removed = (prev?.models ?? []).filter((m) => !catalog.models.includes(m));
      if (changed) {
        let binaryVersion: string | null = prev?.binaryVersion ?? null;
        try {
          const v = await runner(c.command, ["--version"]);
          if (v.exitCode === 0) {
            const m = (v.stdout || v.stderr).match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
            binaryVersion = m ? m[1]! : binaryVersion;
          }
        } catch {
          // keep prior version
        }
        next.providers[id] = {
          models: catalog.models,
          efforts: catalog.efforts,
          detectedAt: now,
          binaryVersion,
          source,
        };
        updated = true;
      }
      perProvider.push({ providerId: id, changed, added, removed, error: null });
    } catch (err) {
      perProvider.push({
        providerId: id,
        changed: false,
        added: [],
        removed: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (updated) {
    try {
      await writeDetectedCache(input.projectRoot, next);
    } catch {
      // a failed write is non-fatal - the run continues on the prior catalog
    }
  }

  return { updated, detail: summarize(perProvider), perProvider };
}

function summarize(per: AutoDetectSummary["perProvider"]): string {
  if (per.length === 0) return "nothing to probe";
  const parts = per.map((p) => {
    if (p.error) return `${p.providerId}: unavailable`;
    if (!p.changed) return `${p.providerId}: up to date`;
    const a = p.added.length ? `+${p.added.length}` : "";
    const r = p.removed.length ? `-${p.removed.length}` : "";
    return `${p.providerId}: ${[a, r].filter(Boolean).join(" ") || "refreshed"}`;
  });
  return parts.join(", ");
}
