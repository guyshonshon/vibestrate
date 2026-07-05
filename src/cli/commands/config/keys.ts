import { configLeafKeys, type ConfigField } from "../../../project/config-introspection.js";
import { color } from "../../ui/format.js";

/**
 * `vibe config keys [filter]` - enumerate every settable config key straight
 * from the Zod schema: the key, its type, allowed enum values, and default.
 * No hand-maintained list, so it can't drift from the schema. `config set --help`
 * points here, and the shell completion reads the same source.
 */
export function runConfigKeys(filter?: string): number {
  const keys = configLeafKeys().filter((k) =>
    filter ? k.fullKey.toLowerCase().includes(filter.toLowerCase()) : true,
  );
  if (keys.length === 0) {
    console.log(
      filter ? `No config keys match "${filter}".` : "No config keys found.",
    );
    return filter ? 1 : 0;
  }
  const width = Math.min(40, Math.max(...keys.map((k) => k.fullKey.length)));
  for (const k of keys) {
    console.log(
      `${color.bold(k.fullKey.padEnd(width))}  ${color.dim(describeType(k))}`,
    );
  }
  console.log("");
  console.log(
    color.dim(
      `Set one with \`vibe config set <key> <value>\`. Arrays/objects take JSON.`,
    ),
  );
  return 0;
}

/** A compact "type [= default] (enum: a|b)" descriptor for one key. */
export function describeType(k: ConfigField): string {
  const parts = [k.type];
  if (k.enum && k.enum.length > 0) parts.push(`one of: ${k.enum.join(" | ")}`);
  if (k.default !== undefined) parts.push(`default ${JSON.stringify(k.default)}`);
  return parts.join("  ·  ");
}
