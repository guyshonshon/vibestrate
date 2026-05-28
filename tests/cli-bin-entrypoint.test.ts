import { describe, it, expect, beforeAll } from "vitest";
import { execa } from "execa";
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distEntry = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../dist/index.js",
);

/**
 * Regression guard for the global-install entrypoint.
 *
 * When installed globally (`npm i -g`, `npm link`), the `vibe` bin is a
 * SYMLINK. The "is this module the entrypoint?" check must compare realpaths,
 * or `process.argv[1]` (the symlink) won't match `import.meta.url` (the
 * resolved module) and the CLI silently does nothing. This test runs the
 * built bundle through a symlink — the exact shape of a global install.
 */
describe("CLI bin entrypoint", () => {
  beforeAll(() => {
    if (!existsSync(distEntry)) {
      throw new Error(
        `dist/index.js not found — run \`pnpm build\` before this test. Looked at ${distEntry}`,
      );
    }
  });

  it("prints a version when run directly", async () => {
    const r = await execa("node", [distEntry, "--version"], { reject: false });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints a version when run through a symlink (global-install shape)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vibestrate-bin-"));
    const link = join(dir, "vibe");
    symlinkSync(distEntry, link);
    const r = await execa("node", [link, "--version"], { reject: false });
    expect(r.exitCode).toBe(0);
    // The bug produced empty stdout (the program never ran).
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("shows help (not the interactive shell) when given --help via a symlink", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vibestrate-bin-"));
    const link = join(dir, "vibe");
    symlinkSync(distEntry, link);
    const r = await execa("node", [link, "--help"], { reject: false });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Usage: vibe/);
  });
});
