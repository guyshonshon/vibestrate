// ── Is this profile's model a model its provider actually has? ──────────────
//
// A profile carrying a model its provider does not offer is a run that fails at
// launch, and nothing used to catch it: the write path checked that the
// PROVIDER was configured and never looked at the model, so `provider: codex`
// with `model: claude-haiku-4-5-20251001` sat in project.yml reading as valid.
//
// The check is only as strong as what we know, and we know two different
// things:
//
//   derived   the model list came from the provider itself - the run-start
//             probe of its bundled catalog (providers-detected.json), or a
//             hand-authored providers-catalog.yml the user declared. This is
//             the provider's own answer, so a model outside it is wrong and
//             the write is refused.
//   curated   the list is our built-in fallback. It goes stale the moment a
//             provider ships a model, so a value outside it is UNVERIFIED, not
//             wrong. Refusing here would block a legitimately new model, so the
//             write goes through and the surfaces say it could not be checked.
//
// Both the config write path and the read surfaces call this, so a profile
// cannot be created through one door and judged by a different rule at another.

import {
  modelIsWired,
  modelSuggestions,
  type ResolvedCatalog,
} from "./provider-apply.js";
import { resolveCatalog, loadCatalogOverlay } from "./provider-catalog-overlay.js";
import { loadDetectedCache } from "./provider-detected-store.js";

/** Where a provider's model list came from, which is what decides how hard we
 *  are allowed to judge a value against it. */
export type ModelListSource = "detected" | "overlay" | "built-in";

export type ModelVerdict =
  /** No model set, or the provider has no model knob - nothing to check. */
  | { code: "not-applicable" }
  /** The model is in a list the provider itself gave us. */
  | { code: "ok"; source: ModelListSource }
  /** Not in a derived list. This model does not exist for this provider. */
  | { code: "unknown-model"; provider: string; model: string; known: string[] }
  /** Only a curated list to check against - allowed, but unproven. */
  | { code: "unverified"; provider: string; model: string };

export type CatalogKnowledge = {
  catalog: ResolvedCatalog;
  /** Provider ids whose model list came from the provider or the user, not us. */
  derived: Set<string>;
  sourceOf: (providerId: string) => ModelListSource;
};

/**
 * Read the resolved catalog once, plus which providers' lists are derived.
 *
 * Callers that check many profiles (the profiles list, the drift sweep) load
 * this ONCE and pass it in - otherwise every profile re-reads two files off
 * disk to answer the same question.
 */
export async function loadCatalogKnowledge(
  projectRoot: string,
): Promise<CatalogKnowledge> {
  const [catalog, overlay, detected] = await Promise.all([
    resolveCatalog(projectRoot),
    loadCatalogOverlay(projectRoot).catch(() => ({}) as Awaited<
      ReturnType<typeof loadCatalogOverlay>
    >),
    loadDetectedCache(projectRoot).catch(() => ({
      schemaVersion: 1 as const,
      providers: {},
    })),
  ]);
  const overlayIds = new Set(Object.keys(overlay.cli ?? {}));
  const detectedIds = new Set(Object.keys(detected.providers));
  const sourceOf = (providerId: string): ModelListSource =>
    overlayIds.has(providerId)
      ? "overlay"
      : detectedIds.has(providerId)
        ? "detected"
        : "built-in";
  return {
    catalog,
    derived: new Set([...overlayIds, ...detectedIds]),
    sourceOf,
  };
}

/** Judge one (provider, model) pair against what we know. Pure - no I/O. */
export function judgeModel(
  knowledge: CatalogKnowledge,
  providerId: string,
  model: string | null | undefined,
): ModelVerdict {
  const trimmed = (model ?? "").trim();
  if (!trimmed) return { code: "not-applicable" };
  if (!modelIsWired(providerId, knowledge.catalog)) return { code: "not-applicable" };

  const known = modelSuggestions(providerId, knowledge.catalog);
  if (known.includes(trimmed)) {
    return { code: "ok", source: knowledge.sourceOf(providerId) };
  }
  if (knowledge.derived.has(providerId)) {
    return { code: "unknown-model", provider: providerId, model: trimmed, known };
  }
  return { code: "unverified", provider: providerId, model: trimmed };
}

/** The sentence a human should read for a verdict, or null when there is
 *  nothing to say. One place, so the API, the CLI and the dashboard agree. */
export function describeModelVerdict(v: ModelVerdict): string | null {
  switch (v.code) {
    case "not-applicable":
    case "ok":
      return null;
    case "unknown-model":
      return `${v.provider} has no model called "${v.model}". A run on this profile will fail at launch.`;
    case "unverified":
      return `Could not verify "${v.model}" against ${v.provider} - its model list has not been probed, so this may or may not exist.`;
  }
}

/**
 * The write-path gate. Throws on a model a derived catalog says does not exist;
 * lets an unverified one through.
 *
 * Fail-closed only where the evidence is real: refusing a value we merely have
 * no record of would make the product unusable the day a provider ships a
 * model, which is the failure mode a hard allowlist actually produces.
 */
export async function assertModelExists(
  projectRoot: string,
  providerId: string,
  model: string | null | undefined,
): Promise<void> {
  const knowledge = await loadCatalogKnowledge(projectRoot);
  const verdict = judgeModel(knowledge, providerId, model);
  if (verdict.code !== "unknown-model") return;
  const suggestion = verdict.known.length
    ? ` Available: ${verdict.known.slice(0, 8).join(", ")}${verdict.known.length > 8 ? ", …" : ""}.`
    : "";
  throw new Error(
    `${verdict.provider} has no model called "${verdict.model}".${suggestion}`,
  );
}
