import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ISSUES_FILENAME } from "../src/core/stores/issues-store.js";

/**
 * The failure inbox is named at the reader in three places; only one of them
 * writes the file.
 *
 * `src/core/error-format.ts` tells a CLI user to open it, `src/ui/lib/
 * error-view.tsx` tells a dashboard user the same, and the server comments it.
 * All three hardcoded "issues.ndjson". The UI cannot import `src/core` (its
 * build uses a separate tsconfig), so the copy there is kept in step by a
 * comment saying "keep in sync" - which is the same discipline that let the
 * installer's Node floor drift.
 *
 * Note the two hint texts are NOT identical, and should not be: the dashboard
 * adds a leading sentence so the hint renders as two lines, and carries hints
 * for 401/403 and 400/422 where the CLI formatter returns none. Only the
 * factual claim - which file to open - has to agree.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("the failure inbox has one filename", () => {
  it("is a plausible filename, so a broken import cannot pass silently", () => {
    expect(ISSUES_FILENAME).toMatch(/^[a-z][a-z0-9.-]+\.ndjson$/);
  });

  it("no source file names a different .ndjson inbox", () => {
    const bad: string[] = [];
    for (const file of sourceFiles(join(repoRoot, "src"))) {
      // The compiled consult corpus embeds documentation prose verbatim; it is
      // generated from docs/content and checked by the docs gates instead.
      if (file.endsWith("handbook-corpus.generated.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\.vibestrate\/([A-Za-z0-9._-]+\.ndjson)/g)) {
        // Per-run logs (events.ndjson, actions.ndjson) live under runs/<id>/,
        // not at the project root - only the root-level inbox is this one.
        if (m[1] !== ISSUES_FILENAME) {
          bad.push(`${file.slice(repoRoot.length + 1)}: names ".vibestrate/${m[1]}"`);
        }
      }
    }
    expect(
      bad.join("\n"),
      `these point at a root-level inbox other than "${ISSUES_FILENAME}"`,
    ).toBe("");
  });

  it("both user-facing hints send the reader to the file that is written", () => {
    const cli = readFileSync(join(repoRoot, "src/core/error-format.ts"), "utf8");
    const ui = readFileSync(join(repoRoot, "src/ui/lib/error-view.tsx"), "utf8");
    for (const [label, text] of [
      ["src/core/error-format.ts", cli],
      ["src/ui/lib/error-view.tsx", ui],
    ] as const) {
      expect(
        text.includes(ISSUES_FILENAME),
        `${label} tells the reader about the failure inbox but never names ${ISSUES_FILENAME}`,
      ).toBe(true);
    }
  });
});
