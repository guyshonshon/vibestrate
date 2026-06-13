// ── Provider model/effort detection (design/provider-capability-detection.md) ─
//
// Some provider CLIs expose their real model catalog. codex 0.134+ ships
// `codex debug models [--bundled]`, emitting JSON with each model's slug,
// display name, and supported reasoning efforts. We probe that to keep the
// model/effort options REAL (the hand-curated SPECS in provider-apply.ts go
// stale and cause "unknown model" failures at run time).
//
// Honest scope: only codex has such a command today. claude/gemini take a
// free-form `--model` string with no list command, so they keep the curated
// fallback. A probe NEVER changes how a knob is applied (that stays in SPECS,
// verified by hand) - it only refreshes which models exist and their efforts.

import type { ProviderDetectionRunner } from "./provider-detection.js";
import type { ProviderConfig } from "./provider-schema.js";

export type DetectedModel = {
  slug: string;
  label: string;
  efforts: string[];
  defaultEffort: string | null;
};

export type DetectedModelCatalog = {
  /** Selectable model slugs (visibility "list" + usable via the API). */
  models: string[];
  modelsRich: DetectedModel[];
  /** Union of supported efforts across the listed models. */
  efforts: string[];
};

export class CapabilityProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityProbeError";
  }
}

/** Which model-probe family a provider config maps to (null = none, keep the
 *  curated fallback). Today only codex - matched by id or command base. */
export function modelProbeFamily(
  providerId: string,
  config: ProviderConfig,
): "codex" | null {
  if (config.type !== "cli") return null;
  const base = (config.command ?? "").split(/[\\/]/).pop() ?? "";
  if (providerId === "codex" || base === "codex") return "codex";
  return null;
}

/** Probe args per family. The binary itself comes from the provider config. */
const PROBE_ARGS: Record<string, { live: string[]; bundled: string[] }> = {
  codex: { live: ["debug", "models"], bundled: ["debug", "models", "--bundled"] },
};

/**
 * Parse `codex debug models` JSON into a catalog. Pure + defensive: returns
 * null on non-JSON, the wrong shape, or zero usable models (the caller then
 * keeps the last-known-good catalog rather than narrowing it - fail closed).
 */
export function parseCodexModels(stdout: string): DetectedModelCatalog | null {
  let doc: unknown;
  try {
    doc = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (
    !doc ||
    typeof doc !== "object" ||
    !Array.isArray((doc as { models?: unknown }).models)
  ) {
    return null;
  }
  const rawModels = (doc as { models: unknown[] }).models;
  const rich: DetectedModel[] = [];
  for (const m of rawModels) {
    if (!m || typeof m !== "object") continue;
    const obj = m as Record<string, unknown>;
    const slug = typeof obj.slug === "string" ? obj.slug : null;
    if (!slug) continue;
    // Only user-selectable models: visible in the picker + usable via the API
    // (the mode Vibestrate's non-interactive `codex exec` uses).
    const visibility = typeof obj.visibility === "string" ? obj.visibility : "list";
    const supportedInApi = obj.supported_in_api !== false; // default-true if absent
    if (visibility !== "list" || !supportedInApi) continue;
    const label =
      typeof obj.display_name === "string" && obj.display_name ? obj.display_name : slug;
    const levels = Array.isArray(obj.supported_reasoning_levels)
      ? (obj.supported_reasoning_levels as unknown[])
          .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>).effort : null))
          .filter((e): e is string => typeof e === "string")
      : [];
    const defaultEffort =
      typeof obj.default_reasoning_level === "string" ? obj.default_reasoning_level : null;
    rich.push({ slug, label, efforts: levels, defaultEffort });
  }
  if (rich.length === 0) return null;
  const models = rich.map((m) => m.slug);
  const seen = new Set<string>();
  const efforts: string[] = [];
  for (const m of rich) {
    for (const e of m.efforts) {
      if (!seen.has(e)) {
        seen.add(e);
        efforts.push(e);
      }
    }
  }
  return { models, modelsRich: rich, efforts };
}

const PARSERS: Record<string, (stdout: string) => DetectedModelCatalog | null> = {
  codex: parseCodexModels,
};

export type ModelDetectResult = {
  catalog: DetectedModelCatalog;
  /** Which probe produced it (e.g. "codex debug models" or "...--bundled"). */
  source: string;
};

/**
 * Probe one provider's real model catalog. Tries the live command first
 * (bounded by the runner's own timeout), falls back to the bundled/offline
 * form, then gives up. Returns null when the family has no probe; throws
 * CapabilityProbeError when a probe exists but every attempt fails/parses
 * empty - so the caller keeps the curated fallback AND can show the real
 * reason (never a silent wipe).
 */
export async function detectProviderModels(input: {
  providerId: string;
  command: string;
  family: "codex";
  runner: ProviderDetectionRunner;
  /** Skip the live (network) attempt - use only the offline `--bundled`
   *  catalog. Used by run-start auto-detection: instant, never hits the
   *  network, reflects whatever the user's installed binary ships. */
  bundledOnly?: boolean;
}): Promise<ModelDetectResult> {
  const probe = PROBE_ARGS[input.family];
  const parse = PARSERS[input.family];
  if (!probe || !parse) {
    throw new CapabilityProbeError(`No model probe for "${input.family}".`);
  }
  const attempts = input.bundledOnly ? [probe.bundled] : [probe.live, probe.bundled];
  let lastErr = "";
  for (const args of attempts) {
    let res;
    try {
      res = await input.runner(input.command, args);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (res.exitCode !== 0) {
      lastErr = (res.stderr || res.stdout || `exit ${res.exitCode}`).trim();
      continue;
    }
    const catalog = parse(res.stdout);
    if (catalog) return { catalog, source: `${input.command} ${args.join(" ")}` };
    lastErr = "the model catalog output was not parseable";
  }
  throw new CapabilityProbeError(
    `Could not read ${input.providerId} models (${lastErr || "no output"}).`,
  );
}
