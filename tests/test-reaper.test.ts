import { describe, it, expect } from "vitest";
import { parseReapablePid } from "./reap-detached-runs.js";

const TMP = "/tmp/claude-501";
const opts = { tmpDir: TMP, selfPid: 4242 };

describe("parseReapablePid (test run-worker reaper scoping)", () => {
  it("matches a run-entry worker whose spec lives under the temp dir", () => {
    const line = `  9082 /usr/bin/node /repo/dist/run-entry.js ${TMP}/vibestrate-server-Ab/.vibestrate/.run-spec-1.json`;
    expect(parseReapablePid(line, opts)).toBe(9082);
  });

  it("ignores a real run (spec under a real project root, not the temp dir)", () => {
    const line =
      "  9082 /usr/bin/node /repo/dist/run-entry.js /Users/guy/Programming/app/.vibestrate/.run-spec-1.json";
    expect(parseReapablePid(line, opts)).toBeNull();
  });

  it("ignores unrelated processes", () => {
    expect(
      parseReapablePid(`  100 /usr/bin/node /repo/dist/index.js ${TMP}/x`, opts),
    ).toBeNull();
    expect(parseReapablePid("  200 /opt/homebrew/bin/postgres -D /var", opts)).toBeNull();
  });

  it("never reaps pid<=1 (init) or our own process", () => {
    const init = `    1 /usr/bin/node /repo/dist/run-entry.js ${TMP}/x/.run-spec.json`;
    const self = ` 4242 /usr/bin/node /repo/dist/run-entry.js ${TMP}/x/.run-spec.json`;
    expect(parseReapablePid(init, opts)).toBeNull();
    expect(parseReapablePid(self, opts)).toBeNull();
  });

  it("returns null for blank or pidless lines", () => {
    expect(parseReapablePid("", opts)).toBeNull();
    expect(
      parseReapablePid(`dist/run-entry.js ${TMP}/x (no pid prefix)`, opts),
    ).toBeNull();
  });
});
