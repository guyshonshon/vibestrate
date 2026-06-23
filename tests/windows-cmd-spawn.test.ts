import { describe, it, expect } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { runArgvCommand } from "../src/execution/command-runner.js";

// Windows-only proof: every npm-installed provider CLI (claude.cmd, codex.cmd,
// gemini.cmd, ...) is a `.cmd` shim on Windows. The orchestrator spawns providers
// via runArgvCommand -> execa, which bundles cross-spawn for PATHEXT/.cmd
// resolution. This proves that path empirically on the windows-latest CI; it is
// skipped elsewhere (macOS/Linux have no .cmd semantics). The load-bearing case
// is #2: a BARE command name resolving to its .cmd on PATH.
describe.skipIf(process.platform !== "win32")(
  "Windows .cmd provider-shim spawn (real)",
  () => {
    it("runs an explicit .cmd path via runArgvCommand", async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vbs-cmd-"));
      const cmd = path.join(dir, "echo-test.cmd");
      await fs.writeFile(cmd, "@echo VIBESTRATE_CMD_OK\r\n");
      const r = await runArgvCommand({ command: cmd, args: [], cwd: dir });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("VIBESTRATE_CMD_OK");
    });

    it("resolves a bare command name to its .cmd via the inherited PATH", async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vbs-cmd-path-"));
      await fs.writeFile(path.join(dir, "vbsfake.cmd"), "@echo BARE_OK\r\n");
      const origPath = process.env.PATH;
      process.env.PATH = `${dir}${path.delimiter}${origPath ?? ""}`;
      try {
        const r = await runArgvCommand({
          command: "vbsfake",
          args: [],
          cwd: dir,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("BARE_OK");
      } finally {
        process.env.PATH = origPath;
      }
    });
  },
);
