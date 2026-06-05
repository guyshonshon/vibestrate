import { describe, it, expect } from "vitest";
import { extractProviderConfigFromYaml } from "../src/ui/lib/provider-yaml.js";

describe("extractProviderConfigFromYaml (Advanced provider editor)", () => {
  it("pulls the named provider's config object out of a providers block", () => {
    const yaml = `providers:
  myclaude:
    type: claude-code
    command: claude
    args: ["-p"]
    env:
      ANTHROPIC_API_KEY: env:MY_KEY
    settings:
      outputFormat: stream-json
      maxTurns: 8
`;
    const r = extractProviderConfigFromYaml(yaml, "myclaude");
    expect(r.error).toBeUndefined();
    expect(r.config).toMatchObject({
      type: "claude-code",
      command: "claude",
      args: ["-p"],
      env: { ANTHROPIC_API_KEY: "env:MY_KEY" },
      settings: { outputFormat: "stream-json", maxTurns: 8 },
    });
  });

  it("errors clearly when the id isn't present under providers", () => {
    const yaml = "providers:\n  other:\n    type: cli\n    command: x\n";
    const r = extractProviderConfigFromYaml(yaml, "missing");
    expect(r.config).toBeUndefined();
    expect(r.error).toContain('entry for "missing"');
  });

  it("errors when there's no providers block at all", () => {
    const r = extractProviderConfigFromYaml("foo: bar\n", "myclaude");
    expect(r.config).toBeUndefined();
    expect(r.error).toContain("providers:");
  });

  it("reports a parse error for malformed YAML instead of throwing", () => {
    const r = extractProviderConfigFromYaml("providers:\n  x: : :\n", "x");
    expect(r.config).toBeUndefined();
    expect(r.error).toMatch(/YAML parse error/i);
  });
});
