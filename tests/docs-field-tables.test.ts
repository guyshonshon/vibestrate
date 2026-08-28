import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { z } from "zod";

import { profileConfigSchema } from "../src/agents/profile-schema.js";
import { crewRoleConfigSchema } from "../src/agents/role-schema.js";
import { crewConfigSchema } from "../src/agents/crew-schema.js";
import {
  flowDefinitionSchema,
  flowStepSchema,
} from "../src/flows/schemas/flow-schema.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { taskSchema } from "../src/roadmap/roadmap-types.js";

/**
 * The concept pages each carry a "What a <type> carries" table naming that
 * type's real fields. Prose about a field that no longer exists is worse than
 * no prose: it reads as authoritative and sends someone to look for a key that
 * is not there.
 *
 * So the tables are checked against the Zod schemas they describe. This is a
 * ONE-WAY guard on purpose. It fails when a table names a field the schema does
 * not have (a rename or a removal), and stays quiet when the schema gains a
 * field the table omits - the tables are deliberately curated, not exhaustive,
 * and `reference/config` is generated from the schema for the full list.
 */

const DOCS = fileURLToPath(new URL("../docs/content/", import.meta.url));

/** The keys of an object schema, through whatever wrappers it is behind. */
function schemaKeys(schema: z.ZodTypeAny): Set<string> {
  let cur: unknown = schema;
  const seen = new Set<unknown>();
  for (let i = 0; i < 8; i += 1) {
    if (!cur || seen.has(cur)) break;
    seen.add(cur);
    const c = cur as { shape?: unknown; _def?: Record<string, unknown> };
    const raw = c.shape ?? c._def?.["shape"];
    const shape = typeof raw === "function" ? (raw as () => object)() : raw;
    if (shape && typeof shape === "object") return new Set(Object.keys(shape));
    cur = c._def?.["innerType"] ?? c._def?.["schema"] ?? c._def?.["out"];
  }
  return new Set();
}

/**
 * `profileConfigSchema` is a `z.preprocess` wrapper (it strips a legacy
 * `budget` key), so its shape is not reachable by unwrapping. Parse a minimal
 * profile instead and read the keys the schema itself fills in - `label` is
 * optional with no default, so it is added by hand.
 */
function profileKeys(): Set<string> {
  const parsed = profileConfigSchema.parse({ provider: "x" });
  return new Set([...Object.keys(parsed), "label"]);
}

const TABLES: { page: string; heading: string; keys: Set<string> }[] = [
  { page: "concepts/flow.md", heading: "What a flow carries", keys: schemaKeys(flowDefinitionSchema) },
  { page: "concepts/workflow.md", heading: "What a step carries", keys: schemaKeys(flowStepSchema) },
  { page: "concepts/profile.md", heading: "What a profile carries", keys: profileKeys() },
  { page: "concepts/role.md", heading: "What a role carries", keys: schemaKeys(crewRoleConfigSchema) },
  { page: "concepts/crew.md", heading: "What a crew carries", keys: schemaKeys(crewConfigSchema) },
  { page: "concepts/run.md", heading: "What a run carries", keys: schemaKeys(runStateSchema) },
  { page: "concepts/task.md", heading: "What a task carries", keys: schemaKeys(taskSchema) },
];

/** The backticked identifiers in the first column of the table under `heading`. */
function tableFields(markdown: string, heading: string): string[] {
  const start = markdown.indexOf(`## ${heading}`);
  if (start === -1) return [];
  const rest = markdown.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, end);
  const out: string[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("| `")) continue; // a body row whose first cell is code
    const first = line.split("|")[1] ?? "";
    for (const m of first.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)) out.push(m[1]!);
  }
  return out;
}

describe("docs field tables name fields that exist", () => {
  it("finds a table on every page that should have one", () => {
    // Guards the parser: a heading rename would otherwise empty every table
    // and turn the real assertion below green while checking nothing.
    const empty = TABLES.filter(
      (t) => tableFields(readFileSync(DOCS + t.page, "utf8"), t.heading).length === 0,
    ).map((t) => `${t.page}: no '## ${t.heading}' table`);
    expect(empty.join("\n")).toBe("");
  });

  it("resolves the schema behind every table", () => {
    // Same failure mode from the other side: an unwrapping change that yielded
    // an empty key set would make every field below "unknown", so assert the
    // sets are populated before trusting them.
    const empty = TABLES.filter((t) => t.keys.size === 0).map((t) => t.page);
    expect(empty.join(", ")).toBe("");
  });

  it("names no field the schema does not have", () => {
    const bad: string[] = [];
    for (const { page, heading, keys } of TABLES) {
      const md = readFileSync(DOCS + page, "utf8");
      for (const field of tableFields(md, heading)) {
        if (!keys.has(field)) bad.push(`${page} '${heading}': \`${field}\` is not on the schema`);
      }
    }
    expect(bad.join("\n"), "docs naming fields that do not exist").toBe("");
  });
});
