// `docs/generated/*.json` is a data document, not a dump of the program that
// produced it. The marketing site renders it into the CLI reference pages and
// the consult handbook compiles it into the product's answer corpus, so a
// value that is secretly JavaScript source is wrong in two places at once and
// looks fine in every green gate - JSON.parse is happy, the schema is happy,
// the byte count is plausible.
//
// It already happened. The generator walked commander's arguments through an
// untyped cast, and on `Argument` the name is a *method* while the neighbouring
// fields are plain properties, so `String(a.name)` captured the function's own
// body. All 207 arguments in the published reference read:
//
//     "name": "name() {\n    return this._name;\n  }"
//
// Named after the invariant: what we generate is data, never source.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(repoRoot, "docs", "generated");

const files = readdirSync(generatedDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

/** Shapes that only appear when a function, not its result, reached the JSON. */
const SOURCE_SHAPES: Array<{ label: string; re: RegExp }> = [
  { label: "a method body reading a private field", re: /\breturn\s+this\._/ },
  { label: "a `function` keyword", re: /\bfunction\s*[\w$]*\s*\(/ },
  { label: "an arrow function", re: /^\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>/m },
  { label: "a `class` declaration", re: /\bclass\s+[\w$]+\s*(?:extends\s+[\w$.]+\s*)?\{/ },
];

/** Every string in the document, addressed by its JSON path for the failure message. */
function* strings(node: unknown, at: string): Generator<{ at: string; value: string }> {
  if (typeof node === "string") {
    yield { at, value: node };
    return;
  }
  if (Array.isArray(node)) {
    for (const [i, child] of node.entries()) yield* strings(child, `${at}[${i}]`);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) yield* strings(value, `${at}.${key}`);
  }
}

const read = (file: string) => JSON.parse(readFileSync(path.join(generatedDir, file), "utf8")) as unknown;

describe("generated docs carry data, not source", () => {
  it("finds the generated documents at all", () => {
    // Without this the sweep below passes by iterating nothing.
    expect(files, "docs/generated/*.json should exist - run `pnpm docs:generate`").toContain(
      "cli-commands.json",
    );
    expect(files.length).toBeGreaterThan(1);
  });

  it.each(files)("%s contains no JavaScript source", (file) => {
    const offenders: string[] = [];
    for (const { at, value } of strings(read(file), file)) {
      for (const { label, re } of SOURCE_SHAPES) {
        if (re.test(value)) offenders.push(`${at} looks like ${label}: ${JSON.stringify(value.slice(0, 80))}`);
      }
    }
    expect(
      offenders,
      "A generator serialized a function instead of calling it. Read the source object through its real type rather than an `unknown` cast - that is what lets `String(someMethod)` compile.",
    ).toEqual([]);
  });

  it("every CLI argument name is a bare identifier", () => {
    // The direct form of the invariant. The sweep above is a net for the whole
    // class; this fails on any argument name that is not a name at all.
    type Cmd = { path?: string[]; arguments?: Array<{ name?: unknown }>; subcommands?: Cmd[] };
    const found: Array<{ where: string; name: unknown }> = [];
    const walk = (cmds: Cmd[]): void => {
      for (const cmd of cmds) {
        const where = (cmd.path ?? []).join(" ");
        for (const arg of cmd.arguments ?? []) found.push({ where, name: arg.name });
        walk(cmd.subcommands ?? []);
      }
    };
    walk((read("cli-commands.json") as { commands?: Cmd[] }).commands ?? []);

    // `vibe config set <path> <value>` is a stable two-argument command; if it
    // ever stops reporting arguments the check above would pass on an empty set.
    expect(
      found.filter((f) => f.where === "vibe config set").map((f) => f.name),
      "cli-commands.json should still record the arguments of `vibe config set`",
    ).toEqual(["path", "value"]);

    const bad = found.filter((f) => typeof f.name !== "string" || !/^[A-Za-z][\w-]*$/.test(f.name));
    expect(
      bad.map((f) => `${f.where}: ${JSON.stringify(f.name)}`),
      "Argument names come from commander's `Argument.name()` method, not its `.name` property.",
    ).toEqual([]);
  });
});
