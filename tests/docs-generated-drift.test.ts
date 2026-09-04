import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * `docs/generated/` is committed output. Nothing checked that it still matches
 * the source it claims to describe, so a schema or flow change could ship with
 * a reference directory quietly describing the previous shape - and the docs
 * site, which builds from these files, would publish the stale version.
 *
 * The handbook corpus already has this guard (tests/consult-handbook.test.ts);
 * this is the same idea for the other half of `pnpm docs:generate`.
 *
 * Renders into a temp directory rather than regenerating in place, so a failing
 * run reports drift instead of silently fixing it and leaving a dirty tree.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The generator is run as `node <tsx's own cli.mjs> <script>` rather than via
 * `node_modules/.bin/tsx`. That extensionless shim is a POSIX shell script;
 * on Windows pnpm writes `tsx.cmd` beside it and `execFileSync` does no
 * PATHEXT lookup, so the shim path is ENOENT there and the test failed on
 * every Windows run. The package's JS entry is the same file on every OS.
 */
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const committedDir = join(repoRoot, "docs", "generated");

/**
 * `meta.json`'s `sourceRev` is deliberately pinned: the generator carries the
 * previous stamp forward and only advances it when the OTHER outputs actually
 * move, so that `pnpm docs:generate` on an unchanged tree produces no diff. A
 * fresh temp directory has no previous stamp to carry, so the generator falls
 * back to HEAD there. Comparing that field would test the fallback, not drift.
 */
function withoutSourceRev(json: string): unknown {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  delete parsed.sourceRev;
  return parsed;
}

describe("docs/generated has not drifted from its source", () => {
  it("regenerating from source reproduces every committed file", () => {
    const out = mkdtempSync(join(tmpdir(), "vibestrate-docsgen-"));
    try {
      execFileSync(
        process.execPath,
        [tsxCli, join("scripts", "generate-docs-metadata.ts")],
        {
          cwd: repoRoot,
          env: { ...process.env, VIBESTRATE_DOCS_OUT: out },
          stdio: "pipe",
        },
      );

      const rendered = readdirSync(out).filter((f) => f.endsWith(".json")).sort();
      expect(rendered.length, "the generator produced no files").toBeGreaterThan(0);

      // A file the generator no longer emits would otherwise go unnoticed.
      const committed = readdirSync(committedDir).filter((f) => f.endsWith(".json")).sort();
      expect(committed, "docs/generated holds a file the generator no longer emits").toEqual(
        rendered,
      );

      const stale: string[] = [];
      for (const name of rendered) {
        const fresh = readFileSync(join(out, name), "utf8");
        const onDisk = readFileSync(join(committedDir, name), "utf8");
        const same =
          name === "meta.json"
            ? JSON.stringify(withoutSourceRev(fresh)) === JSON.stringify(withoutSourceRev(onDisk))
            : fresh === onDisk;
        if (!same) stale.push(name);
      }

      expect(
        stale,
        `stale generated docs - run \`pnpm docs:generate\` and commit the diff:\n  ${stale.join("\n  ")}`,
      ).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
