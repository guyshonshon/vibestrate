import { describe, it, expect } from "vitest";
import {
  PROVIDER_PRESETS,
  buildProviderFromDetection,
  providerLoginInstruction,
  classifyProviderFailure,
} from "../src/providers/provider-presets.js";
import {
  KNOWN_PROVIDERS,
  knownProviderIdForCommand,
} from "../src/providers/provider-detection.js";

describe("PROVIDER_PRESETS registry", () => {
  it("has an entry for every known provider", () => {
    for (const p of KNOWN_PROVIDERS) {
      expect(PROVIDER_PRESETS[p.id], `missing preset for ${p.id}`).toBeDefined();
      // claude ships as the structured `claude-code` provider; the rest are
      // generic `cli`.
      const expectedType = p.id === "claude" ? "claude-code" : "cli";
      expect(PROVIDER_PRESETS[p.id].preset.type).toBe(expectedType);
      expect(typeof PROVIDER_PRESETS[p.id].loginNote).toBe("string");
    }
  });

  it("buildProviderFromDetection swaps the command but copies preset args", () => {
    const cfg = buildProviderFromDetection("gemini", "/usr/local/bin/gemini");
    expect(cfg.command).toBe("/usr/local/bin/gemini");
    expect(cfg.args).toEqual(PROVIDER_PRESETS.gemini.preset.args);
    // Mutating the result must not leak into the shared preset.
    cfg.args.push("--mutated");
    expect(PROVIDER_PRESETS.gemini.preset.args).not.toContain("--mutated");
  });

  it("falls back to the preset command when detection is empty", () => {
    expect(buildProviderFromDetection("codex", "").command).toBe("codex");
  });

  it("login instructions: CLI-login providers vs API-key/local providers", () => {
    expect(providerLoginInstruction("amp").command).toBe("amp login");
    expect(providerLoginInstruction("cursor").command).toBe("cursor-agent login");
    // Local / API-key providers have no login command but still carry a note.
    expect(providerLoginInstruction("ollama").command).toBeNull();
    expect(providerLoginInstruction("aider").command).toBeNull();
    expect(providerLoginInstruction("aider").note).toMatch(/API key/i);
  });
});

describe("knownProviderIdForCommand", () => {
  it("maps bare commands and absolute paths back to ids", () => {
    expect(knownProviderIdForCommand("claude")).toBe("claude");
    expect(knownProviderIdForCommand("/opt/homebrew/bin/codex")).toBe("codex");
    expect(knownProviderIdForCommand("cursor-agent")).toBe("cursor");
    expect(knownProviderIdForCommand("my-custom-cli")).toBeNull();
  });
});

describe("classifyProviderFailure", () => {
  it("flags auth failures from stderr signals", () => {
    expect(
      classifyProviderFailure({
        exitCode: 1,
        stdout: "",
        stderr: "Error: not logged in. Please run `claude login`.",
        matchedMagic: false,
      }),
    ).toBe("auth");
    expect(
      classifyProviderFailure({
        exitCode: 1,
        stdout: "401 Unauthorized",
        stderr: "",
        matchedMagic: false,
      }),
    ).toBe("auth");
  });

  it("classifies a plain non-zero exit as 'exit'", () => {
    expect(
      classifyProviderFailure({
        exitCode: 127,
        stdout: "",
        stderr: "command crashed",
        matchedMagic: false,
      }),
    ).toBe("exit");
  });

  it("classifies a clean exit with no magic token as 'flags'", () => {
    expect(
      classifyProviderFailure({
        exitCode: 0,
        stdout: "here is some unrelated output",
        stderr: "",
        matchedMagic: false,
      }),
    ).toBe("flags");
  });
});
