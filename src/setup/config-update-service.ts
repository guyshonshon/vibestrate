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

export async function getConfigValue(
  projectRoot: string,
  dottedPath: string,
): Promise<GetResult> {
  const { doc } = await readDocument(projectRoot);
  const parts = dottedPath.split(".");
  if (!doc.hasIn(parts as readonly string[])) {
    return { found: false, reason: `Path "${dottedPath}" not found.` };
  }
  const js = doc.toJS({ maxAliasCount: 100 }) as Record<string, unknown>;
  let cursor: unknown = js;
  for (const p of parts) {
    if (cursor && typeof cursor === "object" && p in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[p];
    } else {
      cursor = undefined;
    }
  }
  return { found: true, value: cursor };
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

export async function assignRolesToProvider(
  projectRoot: string,
  providerId: string,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  for (const roleId of builtinRoleIds) {
    if (doc.hasIn(["roles", roleId])) {
      doc.setIn(["roles", roleId, "provider"], providerId);
    }
  }
  await writeDocument(projectRoot, doc);
}

/** Point a single role at a provider (the per-role version of
 *  assignRolesToProvider). Throws if the role or provider isn't in config. */
export async function setRoleProvider(
  projectRoot: string,
  roleId: string,
  providerId: string,
): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (!doc.hasIn(["roles", roleId])) {
    throw new Error(`Role "${roleId}" is not configured.`);
  }
  if (!doc.hasIn(["providers", providerId])) {
    throw new Error(`Provider "${providerId}" is not configured.`);
  }
  doc.setIn(["roles", roleId, "provider"], providerId);
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
