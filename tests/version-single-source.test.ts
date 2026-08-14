// package.json is the ONE source of the version. The CLI and the server both
// import it directly, `docs:generate` derives docs/generated/* from it, and
// release.yml refuses to publish when the git tag disagrees with it.
//
// This file guards the one thing none of that covers: a version typed into
// prose. The README's pin example is a concrete number by necessity - "pin an
// exact version" is not advice you can give with a placeholder - so it is the
// only string in the repo that can silently fall behind. It already did once,
// telling people to pin 0.1.0 after 0.1.1 shipped, which is a doc pointing at a
// release missing whatever the reader just hit.
//
// Named after the invariant: one source, and prose that agrees with it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const pkgVersion = JSON.parse(read("package.json")).version as string;

describe("the version has one source", () => {
  it("README's pin example matches package.json", () => {
    const readme = read("README.md");
    const pin = /"vibestrate":\s*"([^"]+)"/.exec(readme);
    expect(pin, 'README should still contain a `"vibestrate": "x.y.z"` pin example').not.toBeNull();
    expect(
      pin?.[1],
      "README tells people to pin an exact version; that number is hand-typed and just went stale once. Update it, or drop the example.",
    ).toBe(pkgVersion);
  });

  it("the generated docs are stamped from package.json, not typed", () => {
    // Cheap staleness alarm rather than a second source: if these disagree,
    // someone bumped the version and did not run `pnpm docs:generate`, so the
    // reference that ships inside the package describes a different release.
    const meta = JSON.parse(read("docs/generated/meta.json"));
    const cli = JSON.parse(read("docs/generated/cli-commands.json"));
    expect(meta.vibestrateVersion, "run `pnpm docs:generate`").toBe(pkgVersion);
    expect(cli.version, "run `pnpm docs:generate`").toBe(pkgVersion);
  });

  it("no source file declares its own version constant", () => {
    // Both runtime consumers import package.json directly. A literal here would
    // be a second source that drifts silently, since nothing would fail when it
    // disagreed.
    for (const rel of ["src/cli/index.ts", "src/server/server.ts"]) {
      expect(read(rel), `${rel} should read the version from package.json`).toContain(
        'import pkg from "../../package.json"',
      );
    }
  });
});
