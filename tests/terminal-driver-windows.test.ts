import { describe, it, expect, afterEach } from "vitest";
import {
  loadNodePtyDriver,
  _resetDriverCacheForTests,
} from "../src/terminal/terminal-driver.js";

// The integrated-terminal carve-out (TODO E1): on native Windows the production
// driver reports unavailable (with a WSL hint) instead of trying to spawn a
// POSIX shell through node-pty. Deterministic on any host via the platform arg;
// the win32 branch returns BEFORE importing node-pty, so this never loads it.
describe("loadNodePtyDriver Windows carve-out", () => {
  afterEach(() => _resetDriverCacheForTests());

  it("reports unavailable with a WSL hint on native Windows", async () => {
    _resetDriverCacheForTests();
    const driver = await loadNodePtyDriver("win32");
    expect(driver.available).toBe(false);
    expect(driver.unavailableReason).toMatch(/native Windows/i);
    expect(driver.unavailableReason).toMatch(/WSL/);
    expect(() =>
      driver.spawn({ shell: "x", cwd: ".", cols: 80, rows: 24, env: {} }),
    ).toThrow();
  });
});
