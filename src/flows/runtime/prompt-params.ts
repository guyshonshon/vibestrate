import type { FlowParam } from "../schemas/flow-schema.js";

// ── Flow parameter resolution + substitution ─────────────────────────────────
//
// A flow declares typed `params:`; the caller fills them at run start (CLI
// flags, interactive prompts, or a dashboard form). They substitute into the
// task + step instructions via `{{params.<name>}}`. Pure - no disk, no clock,
// no prompts. Secret params are recorded redacted and NOT inlined into prompts
// (a `{{params.<secret>}}` renders a `[secret:<name>]` placeholder), matching
// the product's no-secrets-in-prompts posture.

const PARAM_REF = /\{\{\s*params\.([a-zA-Z0-9_]+)\s*\}\}/g;
const SECRET_PLACEHOLDER = (name: string) => `[secret:${name}]`;

export type FlowParamDefs = Record<string, FlowParam>;

export type ResolvedFlowParams = {
  /** name -> string used for `{{params.x}}` substitution. Secrets carry a
   *  placeholder here, never the real value. */
  substitution: Record<string, string>;
  /** name -> value to persist in run state. Secrets are "[secret]". */
  recorded: Record<string, string | number | boolean>;
  /** Required params with no provided value or default. */
  missing: string[];
  /** Validation errors (bad enum value, non-numeric number, ...). */
  errors: string[];
};

function coerce(
  name: string,
  def: FlowParam,
  raw: string,
): { value: string | number | boolean } | { error: string } {
  switch (def.type) {
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: `${name}: "${raw}" is not a number.` };
      return { value: n };
    }
    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(v)) return { value: true };
      if (["false", "0", "no", "n"].includes(v)) return { value: false };
      return { error: `${name}: "${raw}" is not a boolean (true/false).` };
    }
    case "enum": {
      if (def.values && !def.values.includes(raw)) {
        return { error: `${name}: "${raw}" is not one of: ${def.values.join(", ")}.` };
      }
      return { value: raw };
    }
    case "path":
    case "string":
    default:
      return { value: raw };
  }
}

/** Resolve provided string values against the flow's param schema. `provided`
 *  is name -> raw string (from a flag / form / prompt). Pure + deterministic. */
export function resolveFlowParams(
  defs: FlowParamDefs | null | undefined,
  provided: Record<string, string>,
): ResolvedFlowParams {
  const substitution: Record<string, string> = {};
  const recorded: Record<string, string | number | boolean> = {};
  const missing: string[] = [];
  const errors: string[] = [];
  // Reject values for params the flow doesn't declare (fail fast, don't silently
  // ignore a typo'd --param).
  for (const name of Object.keys(provided)) {
    if (!defs || !(name in defs)) errors.push(`Unknown param "${name}".`);
  }
  for (const [name, def] of Object.entries(defs ?? {})) {
    const has = Object.prototype.hasOwnProperty.call(provided, name);
    const rawDefault = def.default !== undefined ? String(def.default) : undefined;
    const raw = has ? provided[name]! : rawDefault;
    if (raw === undefined || raw === "") {
      if (def.required) missing.push(name);
      continue;
    }
    const c = coerce(name, def, raw);
    if ("error" in c) {
      errors.push(c.error);
      continue;
    }
    if (def.secret) {
      substitution[name] = SECRET_PLACEHOLDER(name);
      recorded[name] = "[secret]";
    } else {
      substitution[name] = String(c.value);
      recorded[name] = c.value;
    }
  }
  return { substitution, recorded, missing, errors };
}

/** Substitute `{{params.<name>}}` in `text`. An undeclared/unresolved reference
 *  is left intact (visible, so the author notices) rather than silently blanked. */
export function substituteParams(
  text: string,
  substitution: Record<string, string>,
): string {
  return text.replace(PARAM_REF, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(substitution, name) ? substitution[name]! : match,
  );
}

/** Every `{{params.x}}` name referenced in a text (for validation/linting). */
export function referencedParamNames(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PARAM_REF)) out.add(m[1]!);
  return [...out];
}
