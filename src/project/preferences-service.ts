// Preference capture (M1, docs/design/preference-gates.md). Owner-explicit
// add/list/remove for persona preferences, so the owner never hand-edits YAML.
// The friction-killer: an owner add is CONFIRMED ON CREATION (the owner authored
// it via their own command, so it is trusted - no separate confirm step). The
// `confirmedAt`/`supervisor-proposed` machinery in the schema stays dormant until
// the M1.5 "supervisor proposes a preference" source lands.
//
// Writes go through the config service (readDocument/writeDocument), which
// preserves YAML comments and validates the WHOLE config against the schema before
// persisting (fail-closed). This is a narrow write surface: only the `preferences`
// array of a known persona is touched, never arbitrary config keys.
import { readDocument, writeDocument } from "../setup/config-update-service.js";
import {
  preferenceSchema,
  type PersonaPreference,
} from "./config-schema.js";
import { loadConfig } from "./config-loader.js";
import { resolvePersona } from "../orchestrator/personas.js";
import { BUILTIN_PERSONAS } from "../orchestrator/personas.js";
import { ConfigError } from "../utils/errors.js";

export type AddOwnerPreferenceInput = {
  personaId: string;
  id: string;
  statement: string;
  correction?: string | null;
  scopeLenses?: string[];
};

/** Read the preferences currently on a persona (resolves built-ins too). Rejects
 *  an unknown persona rather than silently falling back to the default's list. */
export async function listPreferences(
  projectRoot: string,
  personaId: string,
): Promise<PersonaPreference[]> {
  const { config } = await loadConfig(projectRoot);
  if (!BUILTIN_PERSONAS[personaId] && !config.personas?.[personaId]) {
    throw new ConfigError(
      `Unknown persona "${personaId}". Known: ${[...new Set([...Object.keys(BUILTIN_PERSONAS), ...Object.keys(config.personas ?? {})])].join(", ")}.`,
    );
  }
  return resolvePersona(config, personaId).config.preferences ?? [];
}

/**
 * Add an owner preference. Confirmed on creation (live immediately). Materializes a
 * faithful copy of a built-in persona on first write so its review lenses / posture
 * are not silently shadowed away.
 */
export async function addOwnerPreference(
  projectRoot: string,
  input: AddOwnerPreferenceInput,
  now: string,
): Promise<PersonaPreference> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as {
    personas?: Record<string, { preferences?: PersonaPreference[] }>;
  };
  const inConfig = js.personas?.[input.personaId];
  const builtin = BUILTIN_PERSONAS[input.personaId];
  if (!inConfig && !builtin) {
    throw new ConfigError(
      `Unknown persona "${input.personaId}". Define it under personas: or use a built-in (${Object.keys(BUILTIN_PERSONAS).join(", ")}).`,
    );
  }

  const existing = inConfig?.preferences ?? [];
  if (existing.some((p) => p.id === input.id)) {
    throw new ConfigError(
      `Preference "${input.id}" already exists on persona "${input.personaId}".`,
    );
  }

  const pref = preferenceSchema.parse({
    id: input.id,
    statement: input.statement,
    correction: input.correction ?? null,
    scope: { lenses: input.scopeLenses ?? [] },
    source: "owner",
    confirmedAt: now,
  });

  if (inConfig) {
    doc.setIn(["personas", input.personaId, "preferences"], [...existing, pref]);
  } else {
    // Materialize the full built-in (drop undefined via JSON round-trip) so writing
    // a config entry for it does not shadow its lenses/posture with a stub.
    const base = JSON.parse(JSON.stringify(builtin)) as Record<string, unknown>;
    doc.setIn(["personas", input.personaId], { ...base, preferences: [pref] });
  }
  await writeDocument(projectRoot, doc);
  return pref;
}

/** Remove a preference by id. Reports whether anything was removed. */
export async function removePreference(
  projectRoot: string,
  personaId: string,
  preferenceId: string,
): Promise<{ removed: boolean }> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as {
    personas?: Record<string, { preferences?: PersonaPreference[] }>;
  };
  const existing = js.personas?.[personaId]?.preferences;
  if (!existing || existing.length === 0) return { removed: false };
  const filtered = existing.filter((p) => p.id !== preferenceId);
  if (filtered.length === existing.length) return { removed: false };
  doc.setIn(["personas", personaId, "preferences"], filtered);
  await writeDocument(projectRoot, doc);
  return { removed: true };
}
