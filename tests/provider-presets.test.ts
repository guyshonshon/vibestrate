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
    // every project that opens. Treat any change as deliberate. Claude ships as
    // a first-class claude-code provider in stream-json mode (live output +
    // real token/cost); effective args add `--output-format stream-json
    // --verbose --include-partial-messages`.
    expect(claudeCodePreset).toEqual({
      type: "claude-code",
      command: "claude",
      args: ["-p"],
      input: "stdin",
      settings: {
        outputFormat: "stream-json",
        includePartialMessages: true,
      },
    });
  });

  it("codex preset uses `codex exec` with stdin (no removed `-q` flag)", () => {
    expect(codexPreset).toEqual({
      type: "cli",
      command: "codex",
      args: ["exec"],
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
      popular: true,
      installHint: null,
      notes: [],
    });
    expect(cfg.command).toBe("/opt/homebrew/bin/codex");
    expect(cfg.args).toEqual(["exec"]);
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
      popular: true,
      installHint: null,
      notes: [],
    });
    expect(cfg.command).toBe("/opt/homebrew/bin/ollama");
    expect(cfg.args).toEqual(["run", "qwen3.5"]);
    expect(cfg.input).toBe("stdin");
    expect(cfg.type).toBe("cli");
  });
});

describe("KNOWN_PROVIDERS hygiene", () => {
  const POPULAR = new Set(["claude", "codex", "gemini", "aider", "ollama"]);

  it("the popular set is the out-of-the-box, preset-ready tier", () => {
    // Popular providers are auto-configured by doctor --fix / setup.
    // Verification is delegated to `vibe provider test <id>` + login check.
    const popular = KNOWN_PROVIDERS.filter((p) => p.popular);
    expect(new Set(popular.map((p) => p.id))).toEqual(POPULAR);
    for (const p of popular) {
      expect(p.presetReady, `${p.id} should be preset-ready`).toBe(true);
      expect(
        p.notes.join("\n"),
        `${p.id} notes should mention provider test or a login/key step`,
      ).toMatch(/provider test|log in|configure|api key|pull/i);
    }
  });

  it("optional providers are opt-in (detected, never auto-bound)", () => {
    // The rest ship a preset too, but stay opt-in: not popular, not
    // auto-applied — so they detect as 'detected-needs-setup' until the
    // user explicitly applies the preset.
    const optional = KNOWN_PROVIDERS.filter((p) => !p.popular);
    expect(optional.map((p) => p.id).sort()).toEqual([
      "amp",
      "crush",
      "cursor",
      "goose",
      "opencode",
      "qwen",
    ]);
    for (const p of optional) {
      expect(p.presetReady, `${p.id} should be opt-in (not preset-ready)`).toBe(
        false,
      );
    }
  });

  it("ollama note + install hint stay accurate", () => {
    const ollama = KNOWN_PROVIDERS.find((p) => p.id === "ollama");
    expect(ollama?.notes.join("\n")).toMatch(/ollama run qwen3\.5/i);
    expect(ollama?.installHint).toMatch(/install\.sh/);
  });
});
