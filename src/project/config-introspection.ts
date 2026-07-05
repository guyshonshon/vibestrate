import { z, type ZodTypeAny } from "zod";
import { projectConfigBaseSchema } from "./config-schema.js";

// ── Config schema introspection ─────────────────────────────────────────
//
// One source of truth for "what config keys exist, of what type, with what
// allowed values" - walked straight off the Zod schema. The docs generator and
// the CLI (`vibe config set --help`, completion) both use this, so neither has
// a hand-maintained key list to drift.

export type ConfigField = {
  key: string;
  fullKey: string;
  type: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
  children?: ConfigField[];
  itemType?: ConfigField | null;
  notes?: string[];
  /** One-line human description from the schema's `.describe(...)`, if set.
   *  Single source: surfaced in `config keys`, completion, and the docs. */
  description?: string;
};

/** The `.describe(...)` text for a field, wherever it sits in the wrapper chain
 *  (`z.x().default(d).describe(t)` puts it outermost; `z.x().describe(t).default(d)`
 *  inside the ZodDefault). Walk the inner types so either ordering works. */
function getDescription(schema: ZodTypeAny): string | undefined {
  let s: ZodTypeAny | undefined = schema;
  while (s) {
    if (typeof s.description === "string" && s.description.length > 0) {
      return s.description;
    }
    s = (s as { _def?: { innerType?: ZodTypeAny } })._def?.innerType;
  }
  return undefined;
}

function describeZod(schema: ZodTypeAny): {
  type: string;
  notes?: string[];
  extra?: Partial<ConfigField>;
} {
  if (schema instanceof z.ZodOptional) return describeZod(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return describeZod(schema._def.innerType);
  if (schema instanceof z.ZodNullable) {
    const inner = describeZod(schema._def.innerType);
    return { ...inner, type: `${inner.type} | null` };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum) {
    return { type: "enum", extra: { enum: [...schema._def.values] } };
  }
  if (schema instanceof z.ZodLiteral) {
    return { type: `literal(${JSON.stringify(schema._def.value)})` };
  }
  if (schema instanceof z.ZodArray) {
    const item = describeZod(schema._def.type);
    return {
      type: `array<${item.type}>`,
      extra: {
        itemType: {
          key: "[item]",
          fullKey: "[item]",
          type: item.type,
          required: true,
          ...(item.extra ?? {}),
        },
      },
    };
  }
  if (schema instanceof z.ZodRecord) {
    const value = describeZod(schema._def.valueType);
    return { type: `record<string, ${value.type}>` };
  }
  if (schema instanceof z.ZodObject) return { type: "object" };
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const opts = schema._def.options as ZodTypeAny[];
    return { type: opts.map((o) => describeZod(o).type).join(" | ") };
  }
  return {
    type: "unknown",
    notes: ["config introspection does not yet handle this Zod shape"],
  };
}

function isOptional(schema: ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodNullable;
}

function getDefault(schema: ZodTypeAny): unknown {
  if (schema instanceof z.ZodDefault) {
    const def = schema._def.defaultValue;
    return typeof def === "function" ? def() : def;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return getDefault(schema._def.innerType);
  }
  return undefined;
}

function unwrapToCore(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional) return unwrapToCore(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return unwrapToCore(schema._def.innerType);
  if (schema instanceof z.ZodNullable) return unwrapToCore(schema._def.innerType);
  return schema;
}

export function walkObjectSchema(
  schema: z.ZodObject<z.ZodRawShape>,
  parentKey = "",
): ConfigField[] {
  const shape = schema.shape;
  const fields: ConfigField[] = [];
  for (const [key, raw] of Object.entries(shape)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    const optional = isOptional(raw) || raw instanceof z.ZodDefault;
    const defValue = getDefault(raw);
    const core = unwrapToCore(raw);
    const desc = describeZod(raw);
    let children: ConfigField[] | undefined;
    if (core instanceof z.ZodObject) children = walkObjectSchema(core, fullKey);
    fields.push({
      key,
      fullKey,
      type: desc.type,
      required: !optional,
      default: defValue,
      enum: desc.extra?.enum,
      itemType: desc.extra?.itemType ?? null,
      children,
      notes: desc.notes,
      description: getDescription(raw),
    });
  }
  return fields;
}

/** The whole config field tree (the docs generator's source). */
export function configFieldTree(): ConfigField[] {
  return walkObjectSchema(
    projectConfigBaseSchema as unknown as z.ZodObject<z.ZodRawShape>,
  );
}

/** Every LEAF config key (no object containers), flattened with its type, enum,
 *  and default - what `vibe config set --help` + completion enumerate. Record
 *  containers (keyed by arbitrary names, e.g. `providers`) are leaves here: you
 *  set `providers.<id>....`, which the walker can't enumerate statically. */
export function configLeafKeys(): ConfigField[] {
  const out: ConfigField[] = [];
  const visit = (fields: ConfigField[]) => {
    for (const f of fields) {
      const isRecord = f.type.startsWith("record<");
      if (f.children && f.children.length > 0 && !isRecord) {
        visit(f.children);
      } else {
        out.push(f);
      }
    }
  };
  visit(configFieldTree());
  return out;
}

/** Read a dotted path out of a loaded config object (no schema needed). */
function valueAtPath(root: Record<string, unknown>, dottedPath: string): unknown {
  let cur: unknown = root;
  for (const seg of dottedPath.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Compact one-line display of a config value for the `config set` K = V list. */
function formatConfigValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 0 ? value : '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.map((v) => formatConfigValue(v) ?? "?").join(", ")}]`;
  }
  // Objects / records have no single settable value - skip in the K = V list.
  return undefined;
}

/** Current value of every settable leaf key, as `fullKey -> "display"` - the
 *  live half of `config set` completion (each key's CURRENT value shown inline,
 *  so you don't have to remember them). Falls back to the schema default when
 *  the loaded config omits the key. Record-container leaves (arbitrary inner
 *  keys) and object values are skipped (no single value to show). Truncated so
 *  the completion row stays tidy. */
export function configValueHints(config: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!config || typeof config !== "object") return out;
  const root = config as Record<string, unknown>;
  for (const leaf of configLeafKeys()) {
    if (leaf.type.startsWith("record<")) continue;
    const raw = valueAtPath(root, leaf.fullKey);
    const display = formatConfigValue(raw !== undefined ? raw : leaf.default);
    if (display === undefined) continue;
    out[leaf.fullKey] = display.length > 40 ? `${display.slice(0, 39)}...` : display;
  }
  return out;
}

export type ConfigPathCheck = {
  ok: boolean;
  reason?: string;
  /** Leaf keys that look like what the user meant (substring match). */
  suggestions?: string[];
};

/** Validate a dotted config path against the schema BEFORE writing it.
 *  `setConfigValue` auto-creates intermediate maps, so without this a typo like
 *  `provider` silently writes an invalid top-level key. Record segments (e.g.
 *  `providers.<id>`) are accepted from the record onward - their inner keys are
 *  user-named and can't be enumerated statically. */
export function validateConfigPath(dottedPath: string): ConfigPathCheck {
  const parts = dottedPath.split(".").filter(Boolean);
  if (parts.length === 0) return { ok: false, reason: "A config key is required." };
  let level = configFieldTree();
  for (let i = 0; i < parts.length; i += 1) {
    const seg = parts[i]!;
    const match = level.find((f) => f.key === seg);
    if (!match) {
      const here = parts.slice(0, i + 1).join(".");
      return {
        ok: false,
        reason: `"${here}" is not a known config key.`,
        suggestions: suggestKeys(seg),
      };
    }
    if (match.type.startsWith("record<")) return { ok: true }; // arbitrary inner keys
    if (match.children && match.children.length > 0) {
      level = match.children;
      continue;
    }
    // A scalar/array/enum leaf: the path must end here.
    if (i < parts.length - 1) {
      return {
        ok: false,
        reason: `"${match.fullKey}" is a ${match.type}; it has no nested key "${parts[i + 1]}".`,
      };
    }
    return { ok: true };
  }
  // The path ended on an object section, not a settable value.
  return {
    ok: false,
    reason: `"${dottedPath}" is a config section, not a single value - set a key under it.`,
    suggestions: configLeafKeys()
      .filter((k) => k.fullKey.startsWith(`${dottedPath}.`))
      .map((k) => k.fullKey)
      .slice(0, 8),
  };
}

/** Leaf keys whose full path contains the (lowercased) needle - a cheap
 *  did-you-mean for an unknown segment. */
export function suggestKeys(needle: string): string[] {
  const n = needle.toLowerCase();
  return configLeafKeys()
    .filter((k) => k.fullKey.toLowerCase().includes(n) || k.key.toLowerCase().includes(n))
    .map((k) => k.fullKey)
    .slice(0, 8);
}
