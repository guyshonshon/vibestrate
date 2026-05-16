import { describe, it, expect } from "vitest";
import { codexPreset } from "../src/providers/presets/codex.js";
import { claudeCodePreset } from "../src/providers/presets/claude-code.js";
import {
  buildClaudePresetConfig,
  buildCodexPresetConfig,
  buildCodexProviderFromDetection,
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

  it("buildCodexPresetConfig matches the preset file", () => {
    expect(buildCodexPresetConfig()).toEqual(codexPreset);
  });

  it("buildClaudePresetConfig matches the claude preset file", () => {
    // Sanity guard so the two-source-of-truth pattern doesn't drift.
    expect(buildClaudePresetConfig()).toEqual(claudeCodePreset);
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

  it("opencode and aider stay detection-only (V2 — not yet shipped)", () => {
    // Their preset files were deliberately not authored in this slice;
    // detection still surfaces them so users see "missing/needs-setup"
    // honestly. Adding a preset here means flipping this assertion AND
    // shipping the actual preset + builder.
    const opencode = KNOWN_PROVIDERS.find((p) => p.id === "opencode");
    const aider = KNOWN_PROVIDERS.find((p) => p.id === "aider");
    expect(opencode?.presetReady).toBe(false);
    expect(aider?.presetReady).toBe(false);
  });
});
