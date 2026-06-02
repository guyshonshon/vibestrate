import { describe, it, expect } from "vitest";
import {
  PROVIDER_CATALOG,
  providerCapabilities,
} from "../src/providers/provider-catalog.js";

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
      // every provider gets the coarse budget knob
      expect(caps!.budgetLevels.length).toBeGreaterThan(0);
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
    expect(caps.budgetLevels.length).toBeGreaterThan(0);
  });
});
