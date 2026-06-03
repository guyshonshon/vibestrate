import { describe, it, expect } from "vitest";
import {
  PROVIDER_CATALOG,
  providerCapabilities,
  capabilitiesForProvider,
} from "../src/providers/provider-catalog.js";
import { providerConfigSchema } from "../src/providers/provider-schema.js";

// The provider ids the app knows about (mirrors KnownProviderId).
const KNOWN = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "aider",
  "ollama",
  "qwen",
  "crush",
  "goose",
  "cursor",
  "amp",
];

describe("provider catalog", () => {
  it("has an entry for every known provider, each well-formed", () => {
    for (const id of KNOWN) {
      const caps = PROVIDER_CATALOG[id];
      expect(caps, `missing catalog entry for ${id}`).toBeDefined();
      expect(Array.isArray(caps!.models)).toBe(true);
      expect(Array.isArray(caps!.powerLevels)).toBe(true);
    }
  });

  it("exposes real model + effort options for the first-class providers", () => {
    expect(PROVIDER_CATALOG.claude!.models).toEqual(["opus", "sonnet", "haiku"]);
    expect(PROVIDER_CATALOG.claude!.powerLevels).toContain("medium");
    expect(PROVIDER_CATALOG.codex!.models.length).toBeGreaterThan(0);
    expect(PROVIDER_CATALOG.codex!.powerLevels).toContain("high");
    expect(PROVIDER_CATALOG.gemini!.models.some((m) => m.startsWith("gemini-"))).toBe(true);
  });

  it("falls back to a safe default for an unknown/custom provider id", () => {
    const caps = providerCapabilities("some-custom-cli");
    expect(caps.models).toEqual([]);
    expect(caps.powerLevels).toEqual([]);
  });
});

describe("capabilitiesForProvider (api-aware, from a configured provider)", () => {
  it("an http-api openai provider (any id) surfaces real effort + model is settable", () => {
    const config = providerConfigSchema.parse({
      type: "http-api",
      api: "openai",
      baseUrl: "https://api.openai.com",
      model: "gpt-5.5",
      apiKey: "env:K",
    });
    const caps = capabilitiesForProvider("my-gpt", config as never);
    expect(caps.modelEnabled).toBe(true); // http always takes a model id
    expect(caps.powerLevels).toEqual(["minimal", "low", "medium", "high"]);
  });

  it("an anthropic http provider has no effort knob (thinking is a budget)", () => {
    const config = providerConfigSchema.parse({
      type: "http-api",
      api: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
      apiKey: "env:K",
    });
    const caps = capabilitiesForProvider("my-claude-api", config as never);
    expect(caps.modelEnabled).toBe(true);
    expect(caps.powerLevels).toEqual([]);
  });

  it("a cli provider resolves by its well-known id", () => {
    const config = providerConfigSchema.parse({
      type: "cli",
      command: "codex",
    });
    const caps = capabilitiesForProvider("codex", config as never);
    expect(caps.powerLevels).toContain("high");
  });
});
