import path from "node:path";
import YAML from "yaml";
import { readText, writeText, pathExists } from "../utils/fs.js";
import { ConfigError } from "../utils/errors.js";
import {
  projectConfigPath,
  projectRolesDir,
} from "../utils/paths.js";
import { projectConfigSchema, type ProjectConfig } from "../project/config-schema.js";
import { builtinRoleIds } from "../roles/role-schema.js";
import type { ProviderConfig } from "../providers/provider-schema.js";
import { capabilitiesForProvider } from "../providers/provider-catalog.js";
import {
  planPreset,
  CREW_PRESETS,
  type PresetTier,
  type ProviderInfo,
} from "../crews/crew-presets.js";

export type ParsedValue = string | number | boolean | unknown[] | Record<string, unknown>;

const PRIMITIVE_TYPES = new Set(["string", "number", "boolean"]);

export function coerceValueString(input: string): ParsedValue {
  const trimmed = input.trim();
  if (trimmed.length === 0) return input;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return "";
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") || trimmed.startsWith("{") || trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as ParsedValue;
    } catch {
      throw new ConfigError(
        `Could not parse value as JSON: ${input}. Wrap strings in double quotes, lists in [...] with double-quoted items.`,
      );
    }
  }
  return input;
}

export async function readDocumentText(projectRoot: string): Promise<{
  text: string;
  configPath: string;
}> {
  const configPath = projectConfigPath(projectRoot);
  if (!(await pathExists(configPath))) {
    throw new ConfigError(
      `No Vibestrate config found. Run \`vibe init\` first. Looked at ${configPath}.`,
    );
  }
  const text = await readText(configPath);
  return { text, configPath };
}

export async function readDocument(projectRoot: string): Promise<{
  doc: YAML.Document.Parsed;
  configPath: string;
  text: string;
}> {
  const { text, configPath } = await readDocumentText(projectRoot);
  const doc = YAML.parseDocument(text);
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    throw new ConfigError(
      `Could not parse ${path.relative(projectRoot, configPath)}: ${first?.message ?? "unknown YAML error"}`,
    );
  }
  return { doc, configPath, text };
}

export async function writeDocument(
  projectRoot: string,
  doc: YAML.Document,
): Promise<string> {
  const text = doc.toString({ lineWidth: 0 });
  const configPath = projectConfigPath(projectRoot);
  // Validate before writing.
  const parsed = projectConfigSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `Refusing to write invalid config:\n${issues}`,
    );
  }
  await writeText(configPath, text);
  return configPath;
}

export type GetResult =
  | { found: true; value: unknown }
  | { found: false; reason: string };

function navigateDotted(root: unknown, parts: string[]): unknown {
  let cursor: unknown = root;
  for (const p of parts) {
    if (cursor && typeof cursor === "object" && p in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cursor;
}

export async function getConfigValue(
  projectRoot: string,
  dottedPath: string,
): Promise<GetResult> {
  const { doc } = await readDocument(projectRoot);
  const parts = dottedPath.split(".");
  const raw = doc.toJS({ maxAliasCount: 100 }) as Record<string, unknown>;
  // Explicitly written on disk -> return it verbatim (unchanged behavior).
  if (doc.hasIn(parts as readonly string[])) {
    return { found: true, value: navigateDotted(raw, parts) };
  }
  // Not written: fall back to the schema-resolved effective config so a defaulted
  // key (e.g. `git.snapshotRetentionRuns` -> 0) reports its default instead of
  // "not found". A genuinely unknown key (absent even after defaults) and an
  // invalid on-disk config both fall through to "not found".
  const effective = projectConfigSchema.safeParse(raw);
  if (effective.success) {
    const value = navigateDotted(effective.data, parts);
    if (value !== undefined) return { found: true, value };
  }
  return { found: false, reason: `Path "${dottedPath}" not found.` };
}

export type SetResult = {
  configPath: string;
  oldValue: unknown;
  newValue: ParsedValue;
};

export async function setConfigValue(
  projectRoot: string,
  dottedPath: string,
  rawInput: string,
): Promise<SetResult> {
  const { doc } = await readDocument(projectRoot);
  const parts = dottedPath.split(".");
  const value = coerceValueString(rawInput);
  const oldValue = doc.getIn(parts as readonly string[]);
  // setIn auto-creates intermediate maps.
  doc.setIn(parts as readonly string[], value);
  const configPath = await writeDocument(projectRoot, doc);
  return { configPath, oldValue, newValue: value };
}

export async function showConfig(projectRoot: string): Promise<{
  text: string;
  parsed: ProjectConfig | null;
  error: string | null;
}> {
  const { text } = await readDocumentText(projectRoot);
  let parsed: ProjectConfig | null = null;
  let error: string | null = null;
  try {
    const raw = YAML.parse(text);
    const r = projectConfigSchema.safeParse(raw);
    if (r.success) parsed = r.data;
    else
      error = r.error.issues
        .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return { text, parsed, error };
}

export type ValidateResult = {
  ok: boolean;
  issues: string[];
  config: ProjectConfig | null;
};

export async function validateConfigFile(projectRoot: string): Promise<ValidateResult> {
  const { text } = await readDocumentText(projectRoot);
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    return {
      ok: false,
      issues: [
        `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      ],
      config: null,
    };
  }
  const r = projectConfigSchema.safeParse(raw);
  if (r.success) return { ok: true, issues: [], config: r.data };
  return {
    ok: false,
    issues: r.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    ),
    config: null,
  };
}

// Higher-level helpers used by setup/wizard/doctor --fix.

export async function ensureProvider(
  projectRoot: string,
  providerId: string,
  config: ProviderConfig,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  doc.setIn(["providers", providerId], { ...config });
  await writeDocument(projectRoot, doc);
}

/** Delete `providers.<id>` from project.yml. No-op if absent. Caller is
 *  responsible for checking no role still references it (writeDocument
 *  re-validates the whole config, so a dangling reference would throw). */
export async function deleteProvider(
  projectRoot: string,
  providerId: string,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  doc.deleteIn(["providers", providerId]);
  await writeDocument(projectRoot, doc);
}

/** Point every configured Profile at a provider. This is the new "use this
 *  provider for everything" action - Roles run on Profiles, Profiles name the
 *  provider. If no profiles exist yet, create a `<providerId>-balanced` one and
 *  point the default crew's roles at it. */
export async function pointAllProfilesAtProvider(
  projectRoot: string,
  providerId: string,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (!doc.hasIn(["providers", providerId])) {
    throw new Error(`Provider "${providerId}" is not configured.`);
  }
  const js = doc.toJS() as { profiles?: Record<string, unknown> };
  const profileIds = Object.keys(js.profiles ?? {});
  if (profileIds.length === 0) {
    const profileId = `${providerId}-balanced`;
    doc.setIn(["profiles", profileId], {
      provider: providerId,
      label: `${providerId} balanced`,
      model: null,
      power: null,
    });
    for (const roleId of builtinRoleIds) {
      const crewId = defaultCrewIdOf(doc);
      if (doc.hasIn(["crews", crewId, "roles", roleId])) {
        doc.setIn(["crews", crewId, "roles", roleId, "profile"], profileId);
      }
    }
  } else {
    for (const profileId of profileIds) {
      doc.setIn(["profiles", profileId, "provider"], providerId);
    }
  }
  await writeDocument(projectRoot, doc);
}

function defaultCrewIdOf(doc: YAML.Document.Parsed): string {
  const raw = doc.get("defaultCrew");
  return typeof raw === "string" && raw.length > 0 ? raw : "default";
}

/** Update a Profile's fields (provider, model, power, etc.). Creates
 *  the profile if missing. Throws if the named provider isn't configured. */
/** Create a new profile. Fails if the id exists or the provider isn't
 *  configured. Reusable preset a Role can then point at. */
export async function createProfile(
  projectRoot: string,
  profileId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (doc.hasIn(["profiles", profileId])) {
    throw new Error(`Profile "${profileId}" already exists.`);
  }
  const provider = fields.provider;
  if (typeof provider !== "string" || provider.length === 0) {
    throw new Error("A profile needs a provider.");
  }
  if (!doc.hasIn(["providers", provider])) {
    throw new Error(`Provider "${provider}" is not configured.`);
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) doc.setIn(["profiles", profileId, key], value);
  }
  await writeDocument(projectRoot, doc);
}

/** Remove a profile. The caller is responsible for checking it isn't still
 *  referenced by a Role (see `rolesUsingProfile`). */
export async function deleteProfile(
  projectRoot: string,
  profileId: string,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (!doc.hasIn(["profiles", profileId])) {
    throw new Error(`Profile "${profileId}" is not configured.`);
  }
  doc.deleteIn(["profiles", profileId]);
  await writeDocument(projectRoot, doc);
}

export async function setProfileFields(
  projectRoot: string,
  profileId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (
    typeof patch.provider === "string" &&
    !doc.hasIn(["providers", patch.provider])
  ) {
    throw new Error(`Provider "${patch.provider}" is not configured.`);
  }
  for (const [key, value] of Object.entries(patch)) {
    doc.setIn(["profiles", profileId, key], value);
  }
  await writeDocument(projectRoot, doc);
}

/** Update a Crew Role's fields (profile, fills, permissions, label, skills).
 *  Throws if the crew/role isn't configured, or a named profile is missing. */
export async function setCrewRoleFields(
  projectRoot: string,
  crewId: string,
  roleId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (!doc.hasIn(["crews", crewId, "roles", roleId])) {
    throw new Error(`Role "${roleId}" is not configured in crew "${crewId}".`);
  }
  if (
    typeof patch.profile === "string" &&
    !doc.hasIn(["profiles", patch.profile])
  ) {
    throw new Error(`Profile "${patch.profile}" is not configured.`);
  }
  for (const [key, value] of Object.entries(patch)) {
    doc.setIn(["crews", crewId, "roles", roleId, key], value);
  }
  await writeDocument(projectRoot, doc);
}

export async function setValidationCommands(
  projectRoot: string,
  commands: readonly string[],
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  doc.setIn(["commands", "validate"], commands.slice());
  await writeDocument(projectRoot, doc);
}

export function relativeRolesDir(projectRoot: string): string {
  return path.relative(projectRoot, projectRolesDir(projectRoot));
}

/** The provider a preset crew should run on: the provider the project's default
 *  crew's PRIMARY (first) role uses, so presets stay consistent with the user's
 *  setup. On a multi-provider crew that's the first role's provider (predictable,
 *  surfaced to the user), not a vote. Falls back to the first configured provider
 *  only for the (schema-impossible) profile-less crew. */
function deriveProviderRef(config: ProjectConfig): string {
  const crew = config.crews[config.defaultCrew];
  const firstRole = crew ? Object.values(crew.roles)[0] : undefined;
  const prof = firstRole ? config.profiles[firstRole.profile] : undefined;
  if (prof?.provider) return prof.provider;
  const first = Object.keys(config.providers)[0];
  if (!first) {
    throw new ConfigError("No providers configured; cannot build a preset crew.");
  }
  return first;
}

export type InstallPresetResult = {
  crewId: string;
  profileId: string;
  ref: string;
  power: string | null;
  model: string | null;
  maxReviewLoops: number | null;
};

/** Snapshot every configured provider's capabilities + locality for the preset
 *  planner. Locality: cloud `http-api` is remote; everything else is local. */
function providerInfos(config: ProjectConfig): ProviderInfo[] {
  return Object.entries(config.providers).map(([id, p]) => {
    const caps = capabilitiesForProvider(id, p);
    return {
      id,
      isLocal: p.type !== "http-api",
      powerLevels: caps.powerLevels,
      modelEnabled: caps.modelEnabled,
      cheapModel: caps.cheapModel,
    };
  });
}

export type PresetEffect = {
  provider: string;
  model: string | null;
  power: string | null;
  maxReviewLoops: number | null;
};

export type PresetListing = {
  id: PresetTier;
  label: string;
  description: string;
  /** A crew with this id already exists. */
  installed: boolean;
  /** This preset can be built for this project right now. */
  available: boolean;
  /** Why it can't be built (set only when `available` is false). */
  reason?: string;
  /** What installing it would produce (set only when `available`). */
  effect?: PresetEffect;
};

/** Every preset with its install-state and, via a dry `planPreset`, whether it
 *  applies to THIS project (and what it would do, or why it can't). Powers the
 *  CLI `vibe crew presets`, the `/api/crews/presets` route, and the dashboard so
 *  the UI can disable an inapplicable preset and explain why. */
export async function listCrewPresets(projectRoot: string): Promise<PresetListing[]> {
  const { doc } = await readDocument(projectRoot);
  const parsed = projectConfigSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    throw new ConfigError("Current config is invalid; fix it before listing presets.");
  }
  const config = parsed.data;
  const ctx = {
    defaultProviderRef: deriveProviderRef(config),
    providers: providerInfos(config),
    rolesDirRel: relativeRolesDir(projectRoot),
  };
  return CREW_PRESETS.map((p) => {
    const installed = Boolean(config.crews[p.id]);
    const plan = planPreset(p.id, ctx);
    if (!plan.ok) {
      return { id: p.id, label: p.label, description: p.description, installed, available: false, reason: plan.reason };
    }
    return {
      id: p.id,
      label: p.label,
      description: p.description,
      installed,
      available: true,
      effect: {
        provider: plan.provider,
        model: plan.profile.model,
        power: plan.profile.power,
        maxReviewLoops: plan.maxReviewLoops ?? null,
      },
    };
  });
}

/** Install a crew preset (`fast` / `thorough` / `cheap` / `local`) into
 *  project.yml: a profile tuned for the tier plus a crew (the default roster) on
 *  it. Additive and fail-closed:
 *   - the planner refuses when the tier can't be made distinct from the default
 *     crew (no effort levels for fast/thorough, no cheap model for cheap, no
 *     separate local provider for local),
 *   - refuses if the crew/profile id already exists (no overwrite of a prior,
 *     serialized install),
 *   - `writeDocument` validates the whole config before writing, so a bad merge
 *     is rejected rather than persisted. */
export async function installCrewPreset(
  projectRoot: string,
  tier: PresetTier,
): Promise<InstallPresetResult> {
  const { doc } = await readDocument(projectRoot);
  const parsed = projectConfigSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    throw new ConfigError(
      "Current config is invalid; fix it before adding a crew preset.",
    );
  }
  const config = parsed.data;
  const plan = planPreset(tier, {
    defaultProviderRef: deriveProviderRef(config),
    providers: providerInfos(config),
    rolesDirRel: relativeRolesDir(projectRoot),
  });
  if (!plan.ok) throw new ConfigError(plan.reason);
  if (doc.hasIn(["crews", plan.crewId])) {
    throw new ConfigError(`Crew "${plan.crewId}" already exists - not overwriting it.`);
  }
  if (doc.hasIn(["profiles", plan.profileId])) {
    throw new ConfigError(
      `Profile "${plan.profileId}" already exists - not overwriting it.`,
    );
  }
  doc.setIn(["profiles", plan.profileId], plan.profile);
  const crewNode: Record<string, unknown> = { label: plan.crew.label };
  if (plan.maxReviewLoops !== undefined) crewNode.maxReviewLoops = plan.maxReviewLoops;
  crewNode.roles = plan.crew.roles;
  doc.setIn(["crews", plan.crewId], crewNode);
  await writeDocument(projectRoot, doc);
  return {
    crewId: plan.crewId,
    profileId: plan.profileId,
    ref: plan.provider,
    power: plan.profile.power,
    model: plan.profile.model,
    maxReviewLoops: plan.maxReviewLoops ?? null,
  };
}
