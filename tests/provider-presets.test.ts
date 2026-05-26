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
  it("every known provider is preset-ready (works out of the box)", () => {
    // Every provider now ships a preset, so doctor --fix / setup can
    // auto-configure whichever CLI the user has installed. Verification
    // is delegated to `amaco provider test <id>` + the login check.
    for (const p of KNOWN_PROVIDERS) {
      expect(p.presetReady, `${p.id} should be preset-ready`).toBe(true);
      expect(
        p.notes.join("\n"),
        `${p.id} notes should mention provider test or a login/key step`,
      ).toMatch(/provider test|log in|configure|api key|pull/i);
    }
  });

  it("ollama note + install hint stay accurate", () => {
    const ollama = KNOWN_PROVIDERS.find((p) => p.id === "ollama");
    expect(ollama?.notes.join("\n")).toMatch(/ollama run qwen3\.5/i);
    expect(ollama?.installHint).toMatch(/install\.sh/);
  });
});
