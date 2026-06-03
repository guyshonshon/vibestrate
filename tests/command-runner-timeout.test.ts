import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runArgvCommand } from "../src/execution/command-runner.js";

describe("runArgvCommand wall-clock timeout (Slice 4)", () => {
  it("tree-kills a turn that overruns timeoutMs and marks the result", async () => {
    const started = Date.now();
    const result = await runArgvCommand({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"], // would run forever
      cwd: process.cwd(),
      timeoutMs: 300,
    });
    const elapsed = Date.now() - started;
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain("timed out");
    // Killed promptly, not left to run unbounded.
    expect(elapsed).toBeLessThan(3000);
  });

  it.skipIf(process.platform === "win32")(
    "kills the whole process group, not just the direct child",
    async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-treekill-"));
      const pidFile = path.join(dir, "grandchild.pid");
      const parent = path.join(dir, "parent.js");
      // Parent spawns a long-lived grandchild (same process group) and then
      // hangs. If we only killed the direct child, the grandchild would leak.
      await fs.writeFile(
        parent,
        `const { spawn } = require("node:child_process");
const fs = require("node:fs");
const gc = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(gc.pid));
setInterval(() => {}, 1000);
`,
      );
      const result = await runArgvCommand({
        command: process.execPath,
        args: [parent],
        cwd: dir,
        timeoutMs: 500,
      });
      expect(result.exitCode).toBe(-1);
      const gpid = Number((await fs.readFile(pidFile, "utf8")).trim());
      expect(Number.isFinite(gpid)).toBe(true);
      // Poll briefly for the grandchild to be reaped by the group kill.
      let alive = true;
      for (let i = 0; i < 20; i += 1) {
        try {
          process.kill(gpid, 0); // throws ESRCH once the process is gone
        } catch {
          alive = false;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (alive) {
        try {
          process.kill(gpid, "SIGKILL");
        } catch {
          /* cleanup best-effort */
        }
      }
      expect(alive).toBe(false);
    },
  );
});
