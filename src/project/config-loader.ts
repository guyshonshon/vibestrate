import path from "node:path";
import YAML from "yaml";
import { ConfigError } from "../utils/errors.js";
import { readText, pathExists } from "../utils/fs.js";
import {
  vibestrateRoot,
  projectConfigPath,
  projectRulesPath,
} from "../utils/paths.js";
import { projectConfigSchema, type ProjectConfig } from "./config-schema.js";

export type LoadedConfig = {
  projectRoot: string;
  configPath: string;
  config: ProjectConfig;
  rules: string;
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

  const parsed = projectConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `Invalid Vibestrate config at ${configPath}:\n${issues}`,
    );
  }

  const rulesPath = projectRulesPath(projectRoot);
  const rules = (await pathExists(rulesPath))
    ? await readText(rulesPath)
    : DEFAULT_RULES;

  return {
    projectRoot,
    configPath,
    config: parsed.data,
    rules,
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

export async function loadRolePrompt(
  projectRoot: string,
  promptRelOrAbs: string,
): Promise<string> {
  const candidate = path.isAbsolute(promptRelOrAbs)
    ? promptRelOrAbs
    : path.join(projectRoot, promptRelOrAbs);
  if (!(await pathExists(candidate))) {
    throw new ConfigError(`Agent prompt file not found: ${promptRelOrAbs}`);
  }
  return readText(candidate);
}
