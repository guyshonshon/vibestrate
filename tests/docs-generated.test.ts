// `docs/generated/` is derived from source (the commander program, the Zod
// schemas, the provider registry, the builtin flow catalog) and committed so
// the marketing site can render reference pages without installing the CLI.
// Derived-and-committed is exactly the shape that rots: nothing failed when the
// committed JSON fell behind the code it was generated from, because no gate
// re-ran the generator. The `default` flow's description drifted for one commit
// that way.
//
// This closes the first half of the chain. tests/consult-handbook.test.ts
// already guards the second (`docs/content/` + `docs/generated/` -> the
// compiled handbook corpus), but it compares the corpus against whatever is on
// disk - so a stale `docs/generated/` passes there with both sides equally
// wrong. Source -> generated is only checked here.
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocsFiles } from "../scripts/generate-docs-metadata.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const generatedDir = path.join(repoRoot, "docs", "generated");

/** A 200 KB expect diff is unreadable, and an unreadable failure is one people
 *  re-run instead of fixing. Report the first differing line instead. */
function firstDifference(committed: string, generated: string): string {
  const a = committed.split("\n");
  const b = generated.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return [
        `first difference at line ${i + 1}:`,
        `  committed: ${JSON.stringify(a[i] ?? "<end of file>")}`,
        `  generated: ${JSON.stringify(b[i] ?? "<end of file>")}`,
      ].join("\n");
    }
  }
  return "files differ only in trailing bytes";
}

describe("docs/generated", () => {
  it("is what the generator produces from the current source", async () => {
    // sourceRev is the one field that can never match the commit it ships in -
    // regeneration stamps the CURRENT HEAD and the commit carrying the result
    // has a later sha. Pin the committed value so everything else in meta.json
    // (schemaVersion, generator, vibestrateVersion) is still compared exactly;
    // a version bump without a regenerate fails here.
    const committedMeta = JSON.parse(
      await fs.readFile(path.join(generatedDir, "meta.json"), "utf8"),
    ) as { sourceRev: string | null };
    const generated = buildDocsFiles({ sourceRev: committedMeta.sourceRev });

    // The file SET too, not just the contents: a generator that grows a new
    // output nobody committed is drift the per-file loop below never sees.
    const onDisk = (await fs.readdir(generatedDir)).filter((f) => f.endsWith(".json"));
    expect(onDisk.sort()).toEqual([...generated.keys()].sort());

    for (const [filename, json] of generated) {
      const committed = await fs.readFile(path.join(generatedDir, filename), "utf8");
      if (committed !== json) {
        expect.fail(
          `docs/generated/${filename} is stale - run \`pnpm docs:generate\` and commit.\n` +
            firstDifference(committed, json),
        );
      }
    }
  });

  it("renders deterministically, so the gate above cannot flake", () => {
    // The generator's stated contract is "same source -> byte-identical
    // output". If it ever stopped being true (an unsorted key walk, a
    // timestamp), the drift test would fail on innocent commits and get
    // deleted rather than fixed.
    const first = buildDocsFiles({ sourceRev: "pinned" });
    const second = buildDocsFiles({ sourceRev: "pinned" });
    expect([...second.entries()]).toEqual([...first.entries()]);
  });
});
