import { describe, it, expect } from "vitest";
import { renderProviderYaml } from "../src/ui/lib/provider-yaml.js";

describe("renderProviderYaml (type-aware provider YAML preview)", () => {
  it("renders a cli provider with quoted args", () => {
    const yaml = renderProviderYaml("codex", {
      type: "cli",
      command: "codex",
      args: ["exec", "--full auto"],
      input: "stdin",
    });
    expect(yaml).toContain("  codex:");
    expect(yaml).toContain("    type: cli");
    expect(yaml).toContain("    command: codex");
    expect(yaml).toContain('args: [exec, "--full auto"]');
    expect(yaml).toContain("    input: stdin");
  });

  it("renders an http-api provider with an env-ref key and headers", () => {
    const yaml = renderProviderYaml("cloud", {
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      apiKey: "env:ANTHROPIC_API_KEY",
      maxTokens: 4096,
      headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
    });
    expect(yaml).toContain("    type: http-api");
    expect(yaml).toContain("    api: anthropic");
    // URLs and env-refs contain ":" so they're emitted quoted.
    expect(yaml).toContain('    baseUrl: "https://api.anthropic.com"');
    expect(yaml).toContain("    model: claude-sonnet-4-6");
    // The key is an env reference, never a literal secret.
    expect(yaml).toContain('    apiKey: "env:ANTHROPIC_API_KEY"');
    expect(yaml).toContain("    maxTokens: 4096");
    expect(yaml).toContain("    headers:");
    expect(yaml).toContain("      anthropic-beta: prompt-caching-2024-07-31");
  });

  it("omits the optional key for a localhost-proxy without one", () => {
    const yaml = renderProviderYaml("local", {
      type: "localhost-proxy",
      api: "ollama",
      baseUrl: "http://localhost:11434",
      model: "qwen3.5",
      maxTokens: 4096,
    });
    expect(yaml).toContain("    type: localhost-proxy");
    expect(yaml).toContain("    api: ollama");
    expect(yaml).toContain('    baseUrl: "http://localhost:11434"');
    expect(yaml).not.toContain("apiKey");
  });
});
