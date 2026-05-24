import { describe, it, expect } from "vitest";
import { codexPreset } from "../src/providers/presets/codex.js";
import { claudeCodePreset } from "../src/providers/presets/claude-code.js";
import { ollamaPreset } from "../src/providers/presets/ollama.js";
import {
  buildClaudePresetConfig,
  buildCodexPresetConfig,
  buildCodexProviderFromDetection,
  buildOllamaPresetConfig,
  buildOllamaProviderFromDetection,
} from "../src/setup/provider-setup-service.js";
import { KNOWN_PROVIDERS } from "../src/providers/provider-detection.js";

describe("starter presets", () => {
  it("claude-code preset stays at the verified shape (regression guard)", () => {
    // If this ever drifts, doctor --fix auto-applies the new shape on
    // every project that opens. Treat any change as deliberate.
    expect(claudeCodePreset).toEqual({
      type: "cli",
      command: "claude",
      args: ["-p"],
      input: "stdin",
    });
  });

  it("codex preset uses `codex exec -q` with stdin", () => {
    expect(codexPreset).toEqual({
      type: "cli",
      command: "codex",
      args: ["exec", "-q"],
      input: "stdin",
    });
  });

  it("ollama preset uses a starter local model with stdin", () => {
    expect(ollamaPreset).toEqual({
      type: "cli",
      command: "ollama",
      args: ["run", "qwen3.5"],
      input: "stdin",
    });
  });

  it("buildCodexPresetConfig matches the preset file", () => {
    expect(buildCodexPresetConfig()).toEqual(codexPreset);
  });

  it("buildClaudePresetConfig matches the claude preset file", () => {
    // Sanity guard so the two-source-of-truth pattern doesn't drift.
    expect(buildClaudePresetConfig()).toEqual(claudeCodePreset);
  });

  it("buildOllamaPresetConfig matches the ollama preset file", () => {
    expect(buildOllamaPresetConfig()).toEqual(ollamaPreset);
  });

  it("buildCodexProviderFromDetection carries the detected command through", () => {
    const cfg = buildCodexProviderFromDetection({
      id: "codex",
      label: "Codex CLI",
      command: "/opt/homebrew/bin/codex",
      available: true,
      version: "0.9.0",
      detectionMethod: "version",
      confidence: "detected-needs-setup",
      recommended: false,
      notes: [],
    });
    expect(cfg.command).toBe("/opt/homebrew/bin/codex");
    expect(cfg.args).toEqual(["exec", "-q"]);
    expect(cfg.input).toBe("stdin");
    expect(cfg.type).toBe("cli");
  });

  it("buildOllamaProviderFromDetection carries the detected command through", () => {
    const cfg = buildOllamaProviderFromDetection({
      id: "ollama",
      label: "Ollama",
      command: "/opt/homebrew/bin/ollama",
      available: true,
      version: "0.13.0",
      detectionMethod: "version",
      confidence: "detected-needs-setup",
      recommended: false,
      notes: [],
    });
    expect(cfg.command).toBe("/opt/homebrew/bin/ollama");
    expect(cfg.args).toEqual(["run", "qwen3.5"]);
    expect(cfg.input).toBe("stdin");
    expect(cfg.type).toBe("cli");
  });
});

describe("KNOWN_PROVIDERS hygiene", () => {
  it("codex stays presetReady=false (starter only — flags move)", () => {
    // Honest posture: we ship a starter, not a verified-working
    // invocation. Flipping this to true means doctor --fix would
    // auto-configure codex on every project that opens. Do not flip
    // without verifying the flag matrix in a current release.
    const codex = KNOWN_PROVIDERS.find((p) => p.id === "codex");
    expect(codex).toBeDefined();
    expect(codex!.presetReady).toBe(false);
    expect(codex!.notes.join("\n")).toMatch(/starter preset/i);
    expect(codex!.notes.join("\n")).toMatch(/amaco provider test/i);
  });

  it("claude stays presetReady=true (the only verified preset)", () => {
    const claude = KNOWN_PROVIDERS.find((p) => p.id === "claude");
    expect(claude).toBeDefined();
    expect(claude!.presetReady).toBe(true);
  });

  it("opencode, aider, and ollama stay detection-only", () => {
    // OpenCode/Aider do not have starter presets yet. Ollama does, but
    // remains detection-only because local model availability varies by
    // machine; users opt in and then run a provider smoke test.
    const opencode = KNOWN_PROVIDERS.find((p) => p.id === "opencode");
    const aider = KNOWN_PROVIDERS.find((p) => p.id === "aider");
    const ollama = KNOWN_PROVIDERS.find((p) => p.id === "ollama");
    expect(opencode?.presetReady).toBe(false);
    expect(aider?.presetReady).toBe(false);
    expect(ollama?.presetReady).toBe(false);
    expect(ollama?.notes.join("\n")).toMatch(/ollama run qwen3\.5/i);
    expect(ollama?.installHint).toMatch(/install\.sh/);
  });
});
