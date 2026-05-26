import path from "node:path";
import fs from "node:fs/promises";
import YAML from "yaml";
import { ConfigError } from "../../utils/errors.js";
import { pathExists, readText } from "../../utils/fs.js";
import { isPathInside, projectGuidesDir } from "../../utils/paths.js";
import { builtinGuides } from "./builtin-guides.js";
import {
  guideDefinitionSchema,
  type GuideDefinition,
  type GuideSource,
} from "../schemas/guide-schema.js";

const GUIDE_DEFINITION_FILES = ["guide.yml", "guide.yaml"];

export type GuideOrigin = "builtin" | "project";

export type DiscoveredGuide = {
  id: string;
  version: number;
  label: string;
  description: string;
  source: GuideSource;
  definitionPath: string | null;
  definition: GuideDefinition;
};

export class GuideDiscoveryError extends ConfigError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GuideDiscoveryError";
  }
}

function fromBuiltin(definition: GuideDefinition): DiscoveredGuide {
  return {
    id: definition.id,
    version: definition.version,
    label: definition.label,
    description: definition.description,
    source: { kind: "builtin", ref: definition.id },
    definitionPath: null,
    definition,
  };
}

async function parseProjectGuide(filePath: string): Promise<DiscoveredGuide> {
  let raw: unknown;
  try {
    raw = YAML.parse(await readText(filePath));
  } catch (err) {
    throw new GuideDiscoveryError(`Failed to parse Guide YAML at ${filePath}.`, err);
  }

  const parsed = guideDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new GuideDiscoveryError(`Invalid Guide at ${filePath}:\n${issues}`);
  }

  return {
    id: parsed.data.id,
    version: parsed.data.version,
    label: parsed.data.label,
    description: parsed.data.description,
    source: { kind: "project", ref: filePath },
    definitionPath: filePath,
    definition: parsed.data,
  };
}

async function projectDefinitionPath(dirPath: string): Promise<string | null> {
  for (const fileName of GUIDE_DEFINITION_FILES) {
    const filePath = path.join(dirPath, fileName);
    if (await pathExists(filePath)) return filePath;
  }
  return null;
}

async function discoverProjectGuides(projectRoot: string): Promise<DiscoveredGuide[]> {
  const rootDir = projectGuidesDir(projectRoot);
  if (!(await pathExists(rootDir))) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    return [];
  }

  const guides: DiscoveredGuide[] = [];
  for (const entry of entries.sort()) {
    const dirPath = path.join(rootDir, entry);
    let stat;
    try {
      stat = await fs.stat(dirPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const filePath = await projectDefinitionPath(dirPath);
    if (!filePath || !isPathInside(rootDir, filePath)) continue;
    guides.push(await parseProjectGuide(filePath));
  }
  return guides;
}

/**
 * Combine builtins + project guides into the effective set:
 *
 *   - A **project** guide *shadows* a builtin of the same id. This is how
 *     `fork` works — copy a builtin into `.amaco/guides/<id>/` and edit it;
 *     the project version then wins everywhere.
 *   - Two **project** guides claiming the same id is a genuine, unresolvable
 *     conflict (two files, no precedence rule) → error.
 *
 * Builtin order is preserved; a shadowed builtin keeps its slot but carries
 * the project definition. Project-only guides are appended.
 */
function combineGuides(
  builtins: DiscoveredGuide[],
  project: DiscoveredGuide[],
): DiscoveredGuide[] {
  const projectById = new Map<string, DiscoveredGuide>();
  for (const guide of project) {
    const previous = projectById.get(guide.id);
    if (previous) {
      throw new GuideDiscoveryError(
        `Guide id "${guide.id}" is defined by more than one project guide (${previous.definitionPath} and ${guide.definitionPath}).`,
      );
    }
    projectById.set(guide.id, guide);
  }

  const byId = new Map<string, DiscoveredGuide>();
  for (const guide of builtins) byId.set(guide.id, guide);
  for (const guide of project) byId.set(guide.id, guide); // project shadows builtin
  return [...byId.values()];
}

export async function discoverGuides(projectRoot: string): Promise<DiscoveredGuide[]> {
  const builtins = builtinGuides.map(fromBuiltin);
  const project = await discoverProjectGuides(projectRoot);
  return combineGuides(builtins, project);
}

export async function findGuideById(
  projectRoot: string,
  guideId: string,
): Promise<DiscoveredGuide | null> {
  const guides = await discoverGuides(projectRoot);
  return guides.find((guide) => guide.id === guideId) ?? null;
}
