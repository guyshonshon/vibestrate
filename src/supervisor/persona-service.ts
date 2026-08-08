// Shared persona write-service (orchestrator-personas.md). The single place that
// mutates a project's `personas:` / `defaultPersona` config, used by BOTH the CLI
// (`vibe supervisor adopt|default|remove`) and the HTTP routes so the two surfaces
// can't drift and the same safety checks apply everywhere.
//
// Every mutation goes through the schema-validated config layer
// (setConfigValue / readDocument+writeDocument), which re-validates the WHOLE
// config before writing - a mutation that would leave the config invalid (e.g.
// removing the persona that defaultPersona still points at) is rejected, not
// persisted. All are project-root bounded (projectConfigPath).
import { ConfigError } from "../utils/errors.js";
import {
  readDocument,
  writeDocument,
  setConfigValue,
} from "../setup/config-update-service.js";
import { loadConfig } from "../project/config-loader.js";
import {
  BUILTIN_PERSONA_IDS,
  personaConfigSchema,
  personaNameSchema,
} from "../project/config-schema.js";
import { buildPersonaCatalog } from "./personas.js";
import { SUPERVISOR_ARCHETYPES } from "./supervisor-archetypes.js";

/**
 * Adopt a curated archetype into the project: write `personas.<archetypeId>` to
 * project.yml with the SERVER-OWNED archetype object. The persona definition
 * never comes from caller input - only the id is looked up. Re-adopting an id
 * overwrites its entry with the (still valid) archetype. Rejects an unknown id.
 */
export async function adoptArchetype(
  projectRoot: string,
  archetypeId: string,
): Promise<{ id: string }> {
  // Object.hasOwn, NOT a truthy index: SUPERVISOR_ARCHETYPES is a plain object,
  // so `SUPERVISOR_ARCHETYPES["constructor"]` / `["__proto__"]` / `["toString"]`
  // would inherit a truthy value from Object.prototype and slip past a `!archetype`
  // guard - then JSON.stringify(<fn>) === undefined crashes the writer with an
  // uncaught TypeError (500). hasOwn is the load-bearing guarantee here; the
  // whole-config Zod re-validation does NOT reject prototype-named keys.
  if (!Object.hasOwn(SUPERVISOR_ARCHETYPES, archetypeId)) {
    throw new ConfigError(
      `Unknown supervisor archetype "${archetypeId}". Run \`vibe supervisor archetypes\` to list the catalog.`,
    );
  }
  const archetype = SUPERVISOR_ARCHETYPES[archetypeId];
  await setConfigValue(
    projectRoot,
    `personas.${archetypeId}`,
    JSON.stringify(archetype),
  );
  return { id: archetypeId };
}

/**
 * Set the project's default supervisor. `id` must resolve to a built-in OR an
 * existing config persona (checked against the resolved catalog); an id that
 * resolves to neither is rejected before the write. (writeDocument's schema
 * refine also enforces this, but we fail early with a clearer message.)
 */
export async function setDefaultPersona(
  projectRoot: string,
  id: string,
): Promise<{ defaultPersona: string }> {
  const loaded = await loadConfig(projectRoot);
  const catalog = buildPersonaCatalog(loaded.config);
  const known = new Set(catalog.personas.map((p) => p.id));
  if (!known.has(id)) {
    throw new ConfigError(
      `"${id}" is not a known supervisor. Adopt an archetype or add a persona first, then set it as default.`,
    );
  }
  await setConfigValue(projectRoot, "defaultPersona", id);
  return { defaultPersona: id };
}

/**
 * Remove a PROJECT persona from project.yml. Refuses to remove:
 *  - a built-in (it lives in code, not config - there's nothing to remove),
 *  - the current defaultPersona (can't remove the active default; re-point it
 *    first),
 *  - an id that isn't actually a config persona (nothing to remove).
 * Removing the key still runs writeDocument's full re-validation, so the config
 * can never be left dangling.
 */
export async function removePersona(
  projectRoot: string,
  id: string,
): Promise<{ removed: boolean }> {
  if ((BUILTIN_PERSONA_IDS as readonly string[]).includes(id)) {
    throw new ConfigError(
      `"${id}" is a built-in supervisor and cannot be removed.`,
    );
  }
  const { doc } = await readDocument(projectRoot);
  if (!doc.hasIn(["personas", id])) {
    throw new ConfigError(`No project persona "${id}" to remove.`);
  }
  const currentDefault = doc.get("defaultPersona");
  if (currentDefault === id) {
    throw new ConfigError(
      `"${id}" is the current default supervisor. Set a different default before removing it.`,
    );
  }
  doc.deleteIn(["personas", id]);
  await writeDocument(projectRoot, doc);
  return { removed: true };
}

/**
 * Ids that must never become a `personas.<id>` key.
 *
 * `personaNameSchema` permits letters, digits, dashes and underscores, which
 * means `__proto__`, `constructor` and `prototype` all satisfy it. Writing one
 * of those would put a persona behind a key that a later truthy index lookup
 * inherits from Object.prototype - the same hazard `adoptArchetype` guards with
 * Object.hasOwn, reached from the other direction. The whole-config Zod
 * re-validation does NOT reject prototype-named keys, so this list is the guard.
 */
const FORBIDDEN_PERSONA_IDS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Author a project persona from owner input.
 *
 * Unlike `adoptArchetype`, whose definition is server-owned and only referenced
 * by id, every field here arrives from the caller - so it is validated against
 * `personaConfigSchema` before it is written, and rejected rather than coerced.
 * Refuses to shadow a built-in or silently overwrite an existing persona; the
 * caller asks for an update explicitly.
 */
export async function createPersona(
  projectRoot: string,
  id: string,
  config: unknown,
  opts: { overwrite?: boolean } = {},
): Promise<{ id: string }> {
  const trimmed = id.trim();
  if (FORBIDDEN_PERSONA_IDS.has(trimmed)) {
    throw new ConfigError(`"${trimmed}" is a reserved name and cannot be a supervisor id.`);
  }
  const idCheck = personaNameSchema.safeParse(trimmed);
  if (!idCheck.success) {
    throw new ConfigError(
      idCheck.error.issues[0]?.message ?? "Invalid supervisor id.",
    );
  }
  if ((BUILTIN_PERSONA_IDS as readonly string[]).includes(trimmed)) {
    throw new ConfigError(
      `"${trimmed}" is a built-in supervisor. Pick a different id.`,
    );
  }
  const parsed = personaConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ConfigError(
      issue ? `${issue.path.join(".") || "config"}: ${issue.message}` : "Invalid supervisor.",
    );
  }
  if (!opts.overwrite) {
    // Read the document, the same way removePersona checks existence - it is the
    // authoritative view of what is actually written, not the resolved config.
    const { doc } = await readDocument(projectRoot);
    if (doc.hasIn(["personas", trimmed])) {
      throw new ConfigError(
        `A supervisor called "${trimmed}" already exists. Rename it, or edit the existing one.`,
      );
    }
  }
  await setConfigValue(
    projectRoot,
    `personas.${trimmed}`,
    JSON.stringify(parsed.data),
  );
  return { id: trimmed };
}
