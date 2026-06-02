import { describe, it, expect } from "vitest";
import { runClaudeCodeProvider } from "../src/providers/claude-code-provider.js";
import type { ClaudeCodeProviderSchemaConfig } from "../src/providers/provider-schema.js";

// `true` is a no-op binary - lets us assert the argv claude-code assembled.
const noop: ClaudeCodeProviderSchemaConfig = {
  type: "claude-code",
  command: "true",
  args: ["-p"],
  input: "stdin",
  settings: {},
};

describe("claude-code provider applies model + effort as real flags", () => {
  it("injects --model and --effort from the resolved profile", async () => {
    const r = await runClaudeCodeProvider(noop, {
      providerId: "claude",
      prompt: "hi",
      cwd: process.cwd(),
      model: "sonnet",
      effort: "high",
    });
    expect(r.args).toContain("--model");
    expect(r.args[r.args.indexOf("--model") + 1]).toBe("sonnet");
    expect(r.args).toContain("--effort");
    expect(r.args[r.args.indexOf("--effort") + 1]).toBe("high");
  });

  it("omits the flags when the profile sets no model/effort", async () => {
    const r = await runClaudeCodeProvider(noop, {
      providerId: "claude",
      prompt: "hi",
      cwd: process.cwd(),
    });
    expect(r.args).not.toContain("--model");
    expect(r.args).not.toContain("--effort");
  });
});
