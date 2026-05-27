import path from "node:path";
import fs from "node:fs/promises";
import YAML from "yaml";
import { ConfigError } from "../../utils/errors.js";
import { pathExists, readText } from "../../utils/fs.js";
import { isPathInside, projectFlowsDir } from "../../utils/paths.js";
import { builtinFlows } from "./builtin-flows.js";
import {
  flowDefinitionSchema,
  type FlowDefinition,
  type FlowSource,
} from "../schemas/flow-schema.js";

const FLOW_DEFINITION_FILES = ["flow.yml", "flow.yaml"];

export type FlowOrigin = "builtin" | "project";

export type DiscoveredFlow = {
  id: string;
  version: number;
  label: string;
  description: string;
  source: FlowSource;
  definitionPath: string | null;
  definition: FlowDefinition;
};

export class FlowDiscoveryError extends ConfigError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "FlowDiscoveryError";
  }
}

function fromBuiltin(definition: FlowDefinition): DiscoveredFlow {
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

async function parseProjectFlow(filePath: string): Promise<DiscoveredFlow> {
  let raw: unknown;
  try {
    raw = YAML.parse(await readText(filePath));
  } catch (err) {
    throw new FlowDiscoveryError(`Failed to parse Flow YAML at ${filePath}.`, err);
  }

  const parsed = flowDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new FlowDiscoveryError(`Invalid Flow at ${filePath}:\n${issues}`);
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
  for (const fileName of FLOW_DEFINITION_FILES) {
    const filePath = path.join(dirPath, fileName);
    if (await pathExists(filePath)) return filePath;
  }
  return null;
}

async function discoverProjectFlows(projectRoot: string): Promise<DiscoveredFlow[]> {
  const rootDir = projectFlowsDir(projectRoot);
  if (!(await pathExists(rootDir))) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    return [];
  }

  const flows: DiscoveredFlow[] = [];
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
    flows.push(await parseProjectFlow(filePath));
  }
  return flows;
}

/**
 * Combine builtins + project flows into the effective set:
 *
 *   - A **project** flow *shadows* a builtin of the same id. This is how
 *     `fork` works — copy a builtin into `.amaco/flows/<id>/` and edit it;
 *     the project version then wins everywhere.
 *   - Two **project** flows claiming the same id is a genuine, unresolvable
 *     conflict (two files, no precedence rule) → error.
 *
 * Builtin order is preserved; a shadowed builtin keeps its slot but carries
 * the project definition. Project-only flows are appended.
 */
function combineFlows(
  builtins: DiscoveredFlow[],
  project: DiscoveredFlow[],
): DiscoveredFlow[] {
  const projectById = new Map<string, DiscoveredFlow>();
  for (const flow of project) {
    const previous = projectById.get(flow.id);
    if (previous) {
      throw new FlowDiscoveryError(
        `Flow id "${flow.id}" is defined by more than one project flow (${previous.definitionPath} and ${flow.definitionPath}).`,
      );
    }
    projectById.set(flow.id, flow);
  }

  const byId = new Map<string, DiscoveredFlow>();
  for (const flow of builtins) byId.set(flow.id, flow);
  for (const flow of project) byId.set(flow.id, flow); // project shadows builtin
  return [...byId.values()];
}

export async function discoverFlows(projectRoot: string): Promise<DiscoveredFlow[]> {
  const builtins = builtinFlows.map(fromBuiltin);
  const project = await discoverProjectFlows(projectRoot);
  return combineFlows(builtins, project);
}

export async function findFlowById(
  projectRoot: string,
  flowId: string,
): Promise<DiscoveredFlow | null> {
  const flows = await discoverFlows(projectRoot);
  return flows.find((flow) => flow.id === flowId) ?? null;
}
