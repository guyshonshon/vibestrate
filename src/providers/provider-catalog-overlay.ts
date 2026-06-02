// ── User catalog overlay (.vibestrate/providers-catalog.yml) ─────────────────
//
// Lets a user declare or refine a provider's real knobs - models, effort levels,
// and HOW each is applied (CLI flag / config, or HTTP request-body field) - for a
// provider Vibestrate doesn't ship a built-in spec for, or to extend one it does.
// The overlay is validated, then merged over BUILTIN_CATALOG (overlay wins,
// per-field). It never relaxes the "real knobs only" rule: a knob still only
// exists where it maps to a real, declared flag/field. Auto-population of this
// file (probing CLIs / cloud `/models`) is a separate, opt-in step (see TODO C.2).
//
// Precedence: overlay field > built-in field > nothing. An explicit `null`
// (`model: null` / `effort: null`) deliberately CLEARS a built-in knob; omitting
// a field keeps the built-in value.

import { z } from "zod";
import YAML from "yaml";
import { ConfigError } from "../utils/errors.js";
import { readText, pathExists } from "../utils/fs.js";
import { providerCatalogOverlayPath } from "../utils/paths.js";
import {
  BUILTIN_CATALOG,
  type ResolvedCatalog,
  type ProviderApplySpec,
  type HttpApplySpec,
} from "./provider-apply.js";
import type { ProviderConfig } from "./provider-schema.js";

const argApplySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flag"), flag: z.string().min(1) }),
  z.object({ kind: z.literal("config"), flag: z.string().min(1), key: z.string().min(1) }),
]);

const cliEntrySchema = z
  .object({
    models: z.array(z.string()).optional(),
    model: argApplySchema.nullable().optional(),
    effort: z
      .object({ levels: z.array(z.string()).min(1), apply: argApplySchema })
      .nullable()
      .optional(),
  })
  .strict();

const httpEntrySchema = z
  .object({
    models: z.array(z.string()).optional(),
    effort: z
      .object({ levels: z.array(z.string()).min(1), field: z.string().min(1) })
      .nullable()
      .optional(),
  })
  .strict();

export const catalogOverlaySchema = z
  .object({
    cli: z.record(z.string(), cliEntrySchema).optional(),
    http: z.record(z.string(), httpEntrySchema).optional(),
  })
  .strict();

export type CatalogOverlay = z.infer<typeof catalogOverlaySchema>;

/** Read + validate the project's overlay. Returns `{}` when absent (the common
 *  case). Throws ConfigError on malformed YAML / schema violations (noisy refusal
 *  beats silently ignoring a knob the user expected to take effect). */
export async function loadCatalogOverlay(projectRoot: string): Promise<CatalogOverlay> {
  const file = providerCatalogOverlayPath(projectRoot);
  if (!(await pathExists(file))) return {};
  const text = await readText(file);
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    throw new ConfigError(`Failed to parse provider catalog overlay at ${file}.`, err);
  }
  if (raw == null) return {};
  const parsed = catalogOverlaySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid provider catalog overlay at ${file}:\n${issues}`);
  }
  return parsed.data;
}

/** Merge an overlay over a base catalog (built-in by default), per-field. */
export function mergeCatalog(
  overlay: CatalogOverlay,
  base: ResolvedCatalog = BUILTIN_CATALOG,
): ResolvedCatalog {
  const cli: Record<string, ProviderApplySpec> = { ...base.cli };
  for (const [id, e] of Object.entries(overlay.cli ?? {})) {
    const prev = base.cli[id] ?? { models: [], model: null, effort: null };
    cli[id] = {
      models: e.models ?? prev.models,
      model: e.model !== undefined ? e.model : prev.model,
      effort: e.effort !== undefined ? e.effort : prev.effort,
    };
  }
  const http: Record<string, HttpApplySpec> = { ...base.http };
  for (const [api, e] of Object.entries(overlay.http ?? {})) {
    const prev = base.http[api] ?? { models: [], effort: null };
    http[api] = {
      models: e.models ?? prev.models,
      effort: e.effort !== undefined ? e.effort : prev.effort,
    };
  }
  return { cli, http };
}

/** Load + merge in one step: the catalog the surfaces and the spawn should use. */
export async function resolveCatalog(projectRoot: string): Promise<ResolvedCatalog> {
  return mergeCatalog(await loadCatalogOverlay(projectRoot));
}

/** Where a configured provider's spec comes from: the overlay (cli by id /
 *  claude-code -> "claude"; http by api family) or the built-in catalog. Shared
 *  by the CLI, the catalog endpoint, and the shell so all three agree. */
export function providerOverlaySource(
  overlay: CatalogOverlay,
  id: string,
  config: ProviderConfig,
): "overlay" | "built-in" {
  if (config.type === "http-api" || config.type === "localhost-proxy") {
    return overlay.http?.[config.api] ? "overlay" : "built-in";
  }
  const key = config.type === "claude-code" ? "claude" : id;
  return overlay.cli?.[key] ? "overlay" : "built-in";
}
