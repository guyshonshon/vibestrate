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

/** A project flow file that couldn't be used (bad YAML, schema error, or a
 *  duplicate id). Surfaced to the caller so the dashboard can warn about it
 *  without one broken file hiding every other flow. */
export type InvalidFlow = { path: string; message: string };

export type FlowCatalog = {
  flows: DiscoveredFlow[];
  invalid: InvalidFlow[];
};

async function discoverProjectFlows(
  projectRoot: string,
): Promise<{ valid: DiscoveredFlow[]; invalid: InvalidFlow[] }> {
  const rootDir = projectFlowsDir(projectRoot);
  if (!(await pathExists(rootDir))) return { valid: [], invalid: [] };

  let entries: string[];
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    return { valid: [], invalid: [] };
  }

  const valid: DiscoveredFlow[] = [];
  const invalid: InvalidFlow[] = [];
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
    // One malformed flow must not hide the rest — collect it and continue.
    try {
      valid.push(await parseProjectFlow(filePath));
    } catch (err) {
      invalid.push({
        path: filePath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { valid, invalid };
}

/**
 * Combine builtins + project flows into the effective catalog:
 *
 *   - A **project** flow *shadows* a builtin of the same id. This is how
 *     `fork` works — copy a builtin into `.vibestrate/flows/<id>/` and edit it;
 *     the project version then wins everywhere.
 *   - Two **project** flows claiming the same id is an unresolvable conflict
 *     (two files, no precedence rule) → the first wins, the rest are reported
 *     as invalid (not thrown — a conflict shouldn't hide every other flow).
 *
 * Builtin order is preserved; a shadowed builtin keeps its slot but carries
 * the project definition. Project-only flows are appended.
 */
function combineFlows(
  builtins: DiscoveredFlow[],
  project: DiscoveredFlow[],
): FlowCatalog {
  const projectById = new Map<string, DiscoveredFlow>();
  const invalid: InvalidFlow[] = [];
  for (const flow of project) {
    const previous = projectById.get(flow.id);
    if (previous) {
      invalid.push({
        path: flow.definitionPath ?? flow.id,
        message: `Duplicate flow id "${flow.id}" (already defined by ${previous.definitionPath}). Ignoring this one.`,
      });
      continue;
    }
    projectById.set(flow.id, flow);
  }

  const byId = new Map<string, DiscoveredFlow>();
  for (const flow of builtins) byId.set(flow.id, flow);
  for (const flow of projectById.values()) byId.set(flow.id, flow); // project shadows builtin
  return { flows: [...byId.values()], invalid };
}

/** Full catalog: every usable flow plus diagnostics for the ones that couldn't
 *  load. Builtins are always present (they can't be broken by a project file). */
export async function discoverFlowCatalog(projectRoot: string): Promise<FlowCatalog> {
  const builtins = builtinFlows.map(fromBuiltin);
  const project = await discoverProjectFlows(projectRoot);
  const combined = combineFlows(builtins, project.valid);
  return {
    flows: combined.flows,
    invalid: [...project.invalid, ...combined.invalid],
  };
}

export async function discoverFlows(projectRoot: string): Promise<DiscoveredFlow[]> {
  return (await discoverFlowCatalog(projectRoot)).flows;
}

export async function findFlowById(
  projectRoot: string,
  flowId: string,
): Promise<DiscoveredFlow | null> {
  const flows = await discoverFlows(projectRoot);
  return flows.find((flow) => flow.id === flowId) ?? null;
}
