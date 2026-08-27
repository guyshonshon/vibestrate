import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One Node floor, stated in four places, checked here.
 *
 * `engines.node` is the only one that binds. The installer has to refuse the
 * same versions the package will, and it did not: `MIN_NODE_MAJOR` sat at 22
 * after the floor moved to 24, so `install.sh` told the user they were fine and
 * npm then printed EBADENGINE. It installs anyway, and the binary dies on a
 * module-resolution stack trace that reads like a broken package rather than a
 * wrong Node.
 *
 * The coupling was a comment saying "must track engines.node in package.json".
 * A comment is discipline; this is the check.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

/** The major from `engines.node` - the one floor everything else must match. */
function enginesFloor(): number {
  const engines = (JSON.parse(read("package.json")) as { engines?: { node?: string } }).engines;
  const raw = engines?.node;
  expect(raw, "package.json has no engines.node").toBeTruthy();
  const m = /(\d+)/.exec(raw!);
  expect(m, `could not read a major version out of engines.node ("${raw}")`).toBeTruthy();
  return Number(m![1]);
}

describe("the Node floor is stated once and echoed consistently", () => {
  const floor = enginesFloor();

  it("is a plausible floor, so a parse failure cannot pass silently", () => {
    expect(floor).toBeGreaterThanOrEqual(18);
    expect(floor).toBeLessThan(100);
  });

  it("install.sh refuses exactly what the package refuses", () => {
    const m = /^MIN_NODE_MAJOR=(\d+)$/m.exec(read("install.sh"));
    expect(m, "install.sh no longer declares MIN_NODE_MAJOR on its own line").toBeTruthy();
    expect(
      Number(m![1]),
      `install.sh green-lights Node ${m![1]}+ while package.json requires ${floor}+`,
    ).toBe(floor);
  });

  it("the CI workflows build on a Node the package accepts", () => {
    for (const wf of [".github/workflows/ci.yml", ".github/workflows/ci-windows.yml"]) {
      let text: string;
      try {
        text = read(wf);
      } catch {
        continue; // a workflow that does not exist is not a mismatch
      }
      const versions = [...text.matchAll(/node-version:\s*\[?["']?(\d+)/g)].map((m) =>
        Number(m[1]),
      );
      for (const v of versions) {
        expect(v, `${wf} builds on Node ${v}, below the engines floor of ${floor}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("the bug report template does not suggest an unsupported Node", () => {
    // The example is the one a user copies while something is already broken,
    // so an unsupported version there reads as supported.
    const text = read(".github/ISSUE_TEMPLATE/bug_report.yml");
    for (const m of text.matchAll(/node v?(\d+)/gi)) {
      expect(
        Number(m[1]),
        `bug_report.yml shows "node v${m[1]}" as an example, below the floor of ${floor}`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });
});
