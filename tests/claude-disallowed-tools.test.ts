import { describe, it, expect } from "vitest";
import { runClaudeCodeProvider } from "../src/providers/claude-code-provider.js";
import type { ClaudeCodeProviderConfig } from "../src/providers/claude-code-settings.js";
import type { ProviderRunInput } from "../src/providers/provider-types.js";

// The `--disallowedTools` flag (profile knob, P3). `node -e 0` ignores the extra
// argv, so the spawn exits cleanly and we can inspect the args the provider
// actually built (returned on the result).

const config: ClaudeCodeProviderConfig = {
  type: "claude-code",
  command: "node",
  args: ["-e", "0"],
  input: "arg",
  settings: { outputFormat: "text" },
};

function input(extra: Partial<ProviderRunInput>): ProviderRunInput {
  return {
    providerId: "claude",
    prompt: "PROMPT",
    cwd: process.cwd(),
    ...extra,
  };
}

describe("claude-code provider --disallowedTools", () => {
  it("emits the flag comma-joined, with the prompt still the final positional", async () => {
    const r = await runClaudeCodeProvider(
      config,
      input({ disallowedTools: ["Task", "Bash"] }),
    );
    const i = r.args.indexOf("--disallowedTools");
    expect(i).toBeGreaterThanOrEqual(0);
    // ONE comma-joined token (Claude Code splits it internally).
    expect(r.args[i + 1]).toBe("Task,Bash");
    // The prompt is the final positional, guarded by a `--` end-of-options
    // separator so the variadic flag can't consume it (the real failure mode).
    expect(r.args[r.args.length - 1]).toBe("PROMPT");
    expect(r.args[r.args.length - 2]).toBe("--");
  });

  it("omits the flag when unset or empty (default-off, today's behavior)", async () => {
    const unset = await runClaudeCodeProvider(config, input({}));
    expect(unset.args).not.toContain("--disallowedTools");

    const empty = await runClaudeCodeProvider(config, input({ disallowedTools: [] }));
    expect(empty.args).not.toContain("--disallowedTools");

    const nulled = await runClaudeCodeProvider(
      config,
      input({ disallowedTools: null }),
    );
    expect(nulled.args).not.toContain("--disallowedTools");
  });
});
