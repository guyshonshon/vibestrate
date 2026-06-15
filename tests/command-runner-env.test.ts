import { describe, it, expect } from "vitest";
import { runArgvCommand } from "../src/execution/command-runner.js";

// Regression for the nested-claude session collision: a spawned child must not
// inherit the host Claude Code identity (CLAUDE_CODE_* / CLAUDECODE), or a nested
// `claude` collides on session ids ("Session ID ... is already in use").
describe("command-runner strips host Claude Code env from spawned children", () => {
  it("drops CLAUDE_CODE_* and CLAUDECODE but keeps other env", async () => {
    process.env.CLAUDE_CODE_SESSION_ID = "host-session-xyz";
    process.env.CLAUDE_CODE_SSE_PORT = "12345";
    process.env.CLAUDECODE = "1";
    process.env.CR_ENV_KEEP_ME = "kept";
    try {
      const r = await runArgvCommand({
        command: "node",
        args: [
          "-e",
          "process.stdout.write(JSON.stringify({" +
            "s:process.env.CLAUDE_CODE_SESSION_ID??null," +
            "p:process.env.CLAUDE_CODE_SSE_PORT??null," +
            "c:process.env.CLAUDECODE??null," +
            "keep:process.env.CR_ENV_KEEP_ME??null}))",
        ],
        cwd: process.cwd(),
      });
      const seen = JSON.parse(r.stdout);
      expect(seen.s).toBeNull();
      expect(seen.p).toBeNull();
      expect(seen.c).toBeNull();
      expect(seen.keep).toBe("kept");
    } finally {
      delete process.env.CLAUDE_CODE_SESSION_ID;
      delete process.env.CLAUDE_CODE_SSE_PORT;
      delete process.env.CLAUDECODE;
      delete process.env.CR_ENV_KEEP_ME;
    }
  });
});
