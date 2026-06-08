// Client helpers for the Flow Builder's raw-YAML escape hatch - render a Flow
// definition to YAML for hand-editing, and pull the (lightly-checked) definition
// back out of edited text. Mirrors `provider-yaml.ts`. The SERVER is the real
// gate: a raw-YAML save goes through the existing import path
// (`api.importFlow({ yaml, overwrite })`), which re-validates against the full
// flow schema and runs the size / control-char / secret guards. This module
// only needs to seed the editor and catch obvious mistakes early (bad YAML,
// not-a-flow, an id that doesn't match the flow being edited).
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { FlowDefinition } from "./types.js";

/** Serialize a Flow definition to YAML text for the raw editor. */
export function renderFlowYaml(definition: FlowDefinition): string {
  return stringifyYaml(definition);
}

/**
 * Parse edited YAML into a Flow definition shape. This is a LIGHT check only
 * (valid YAML + an object with an `id`); the server re-validates the full schema
 * on save. Returns the parsed object + its id, or a human error.
 */
export function extractFlowFromYaml(
  yamlText: string,
): { definition?: FlowDefinition; id?: string; error?: string } {
  let doc: unknown;
  try {
    doc = parseYaml(yamlText);
  } catch (err) {
    return {
      error: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { error: "The YAML must describe a single Flow (a top-level object)." };
  }
  const id = (doc as Record<string, unknown>).id;
  if (typeof id !== "string" || id.length === 0) {
    return { error: 'The Flow YAML needs a string `id`.' };
  }
  return { definition: doc as FlowDefinition, id };
}
