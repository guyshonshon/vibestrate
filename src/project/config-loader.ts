// Reading `.vibestrate/project.yml` into a validated `ProjectConfig`, plus the
// project rules file that travels with it. This is the schema-validated read
// path; the surgical edit path (`setup/config-update-service.ts`) parses the
// same file as a YAML document so it can write back preserving comments.
//
// Whatever has to happen BEFORE validation belongs here, so that the schema on
// this path is handed a canonical shape. The steps that do so run against the
// raw parsed YAML below: carrying a renamed block forward (otherwise the old
// key is dropped and the project silently reverts to defaults), and raising a
// targeted message for a key that moved (otherwise the owner gets an opaque
// validation error).
//
// A missing file, unparseable YAML and a schema rejection all raise a
// `ConfigError`; the schema rejection lists each issue by path. A file that
// exists but cannot be read surfaces the raw fs error instead. The rules file
// is softer: absent, it falls back to a default string instead of failing.

import path from "node:path";
import YAML from "yaml";
import { ConfigError } from "../utils/errors.js";
import { loadProjectRuleset, type ProjectRuleset } from "./project-rules.js";
import { readText, pathExists } from "../utils/fs.js";
import {
  vibestrateRoot,
  projectConfigPath,
} from "../utils/paths.js";
import { projectConfigSchema, type ProjectConfig } from "./config-schema.js";
import { parseRoleFile } from "../agents/role-schema.js";

export type LoadedConfig = {
  projectRoot: string;
  configPath: string;
  config: ProjectConfig;
  rules: string;
  /** Where the rules came from, plus anything refused or truncated. */
  ruleset: ProjectRuleset;
};

const DEFAULT_RULES =
  "# Project Instructions for Vibestrate\n\nDescribe the project here.\n";

export async function loadConfig(projectRoot: string): Promise<LoadedConfig> {
  const configPath = projectConfigPath(projectRoot);
  if (!(await pathExists(configPath))) {
    throw new ConfigError(
      `Vibestrate config not found at ${configPath}. Run "vibe init" first.`,
    );
  }

  const text = await readText(configPath);
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    throw new ConfigError(`Failed to parse YAML config at ${configPath}.`, err);
  }

  // One-time key migration: the supervised-run defaults moved from `saga:` to
  // `supervised:` (kind:"saga" became runMode:"supervised"). Carry a legacy
  // block forward so a project that tuned its supervisor/budget doesn't silently
  // revert to defaults. The schema is non-strict, so a stale `saga:` would
  // otherwise just be ignored.
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.saga !== undefined && r.supervised === undefined) {
      r.supervised = r.saga;
    }
    delete r.saga;
  }

  // Targeted migration error: persona-scoped `preferences` moved to top-level
  // `projectPolicies`. Catch a leftover key before the generic strict-schema
  // rejection so the owner gets an actionable message instead of an opaque
  // "unknown key".
  const personas = (raw as { personas?: Record<string, unknown> } | null)?.personas;
  if (personas && typeof personas === "object") {
    for (const persona of Object.values(personas)) {
      if (persona && typeof persona === "object" && "preferences" in persona) {
        throw new ConfigError(
          `Config at ${configPath} has persona-scoped "preferences", which moved to the project-level "projectPolicies" surface. Run "vibe policies migrate" to lift them and remove the old key.`,
        );
      }
    }
  }

  const parsed = projectConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `Invalid Vibestrate config at ${configPath}:\n${issues}`,
    );
  }

  // Composed from rules.md plus any .vibestrate/rules/*.md - redacted, bounded
  // and path-guarded there, because this text enters every prompt.
  const ruleset = await loadProjectRuleset(projectRoot, DEFAULT_RULES);

  return {
    projectRoot,
    configPath,
    config: parsed.data,
    rules: ruleset.text,
    ruleset,
  };
}

export function vibestrateExists(projectRoot: string): Promise<boolean> {
  return pathExists(vibestrateRoot(projectRoot));
}

export function configExists(projectRoot: string): Promise<boolean> {
  return pathExists(projectConfigPath(projectRoot));
}

export function relativeConfigPath(projectRoot: string): string {
  return path.relative(projectRoot, projectConfigPath(projectRoot));
}

/**
 * Read a role's instruction text out of its JSON role file. The `.md` role
 * prompts this replaced are gone, so a config still pointing at one is a config
 * that has to be edited, not a shape to fall back to.
 */
export async function loadRolePrompt(
  projectRoot: string,
  promptRelOrAbs: string,
): Promise<string> {
  const candidate = path.isAbsolute(promptRelOrAbs)
    ? promptRelOrAbs
    : path.join(projectRoot, promptRelOrAbs);
  if (path.extname(candidate).toLowerCase() !== ".json") {
    throw new ConfigError(
      `Role "prompt" points at ${promptRelOrAbs}, but roles are stored as JSON role files. Point it at ${promptRelOrAbs.replace(/\.[^./\\]*$/, "")}.json and move the instruction text into that file's "prompt" field.`,
    );
  }
  if (!(await pathExists(candidate))) {
    throw new ConfigError(`Role file not found: ${promptRelOrAbs}`);
  }
  return parseRoleFile(await readText(candidate), candidate).prompt;
}
