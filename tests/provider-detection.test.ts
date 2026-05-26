import { describe, it, expect } from "vitest";
import {
  detectAllProviders,
  detectProvider,
  installHintForCommand,
  KNOWN_PROVIDERS,
  pickRecommendedProvider,
  summarizeDetections,
  type ProviderDetectionRunner,
} from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) => {
  if (cmd === "claude")
    return { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" };
  return { exitCode: 127, stdout: "", stderr: `command not found: ${cmd}` };
};

const allMissing: ProviderDetectionRunner = async () => {
  throw new Error("ENOENT");
};

const codexOnly: ProviderDetectionRunner = async (cmd) => {
  if (cmd === "codex") return { exitCode: 0, stdout: "codex 0.9.0", stderr: "" };
  return { exitCode: 127, stdout: "", stderr: "" };
};

const ollamaOnly: ProviderDetectionRunner = async (cmd) => {
  if (cmd === "ollama")
    return { exitCode: 0, stdout: "ollama version is 0.13.0", stderr: "" };
  return { exitCode: 127, stdout: "", stderr: "" };
};

describe("provider detection", () => {
  it("returns missing entry for ENOENT", async () => {
    const detections = await detectAllProviders(allMissing);
    expect(detections).toHaveLength(KNOWN_PROVIDERS.length);
    for (const d of detections) {
      expect(d.available).toBe(false);
      expect(d.confidence).toBe("missing");
      expect(d.detectionMethod).toBe("failed");
    }
  });

  it("flags Claude as ready when version exits 0", async () => {
    const detections = await detectAllProviders(claudeOk);
    const claude = detections.find((d) => d.id === "claude")!;
    expect(claude.available).toBe(true);
    expect(claude.confidence).toBe("ready");
    expect(claude.recommended).toBe(true);
    expect(claude.version).toBe("2.1.0");
    const others = detections.filter((d) => d.id !== "claude");
    for (const d of others) expect(d.available).toBe(false);
  });

  it("flags Codex as ready (ships a preset)", async () => {
    const detections = await detectAllProviders(codexOnly);
    const codex = detections.find((d) => d.id === "codex")!;
    expect(codex.available).toBe(true);
    expect(codex.confidence).toBe("ready");
    expect(codex.recommended).toBe(true);
  });

  it("flags Ollama as ready with its starter preset", async () => {
    const detections = await detectAllProviders(ollamaOnly);
    const ollama = detections.find((d) => d.id === "ollama")!;
    expect(ollama.available).toBe(true);
    expect(ollama.confidence).toBe("ready");
    expect(ollama.recommended).toBe(true);
    expect(ollama.version).toBe("0.13.0");
    expect(ollama.notes.join("\n")).toMatch(/ollama run qwen3\.5/i);
  });

  it("does not mark non-zero exit as available", async () => {
    const runner: ProviderDetectionRunner = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "auth required",
    });
    const claude = await detectProvider(KNOWN_PROVIDERS[0]!, runner);
    expect(claude.available).toBe(false);
    expect(claude.confidence).toBe("missing");
  });

  it("renders exit code -1 as a missing PATH command", async () => {
    const runner: ProviderDetectionRunner = async () => ({
      exitCode: -1,
      stdout: "",
      stderr: "",
    });
    const ollamaDef = KNOWN_PROVIDERS.find((p) => p.id === "ollama")!;
    const ollama = await detectProvider(ollamaDef, runner);
    expect(ollama.available).toBe(false);
    expect(ollama.notes[0]).toBe("ollama is not on PATH.");
  });

  it("pickRecommendedProvider returns the first preset-ready available one, else null", async () => {
    const ready = await detectAllProviders(claudeOk);
    expect(pickRecommendedProvider(ready)?.id).toBe("claude");

    // Every provider is preset-ready now, so a codex-only machine
    // recommends codex (it used to be null when codex was detection-only).
    const codexMachine = await detectAllProviders(codexOnly);
    expect(pickRecommendedProvider(codexMachine)?.id).toBe("codex");

    const empty = await detectAllProviders(allMissing);
    expect(pickRecommendedProvider(empty)).toBeNull();
  });

  it("summarizeDetections groups by confidence", async () => {
    const detections = await detectAllProviders(async (cmd) => {
      if (cmd === "claude") return { exitCode: 0, stdout: "1.0", stderr: "" };
      if (cmd === "codex") return { exitCode: 0, stdout: "0.5", stderr: "" };
      return { exitCode: 127, stdout: "", stderr: "" };
    });
    const summary = summarizeDetections(detections);
    // All known providers ship presets now, so any available one is "ready".
    expect(summary.ready.map((d) => d.id)).toEqual(["claude", "codex"]);
    expect(summary.needsSetup.map((d) => d.id)).toEqual([]);
    expect(summary.missing.map((d) => d.id).sort()).toEqual([
      "aider",
      "amp",
      "crush",
      "cursor",
      "gemini",
      "goose",
      "ollama",
      "opencode",
      "qwen",
    ]);
  });

  it("detection runner is never asked to send a real prompt", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const runner: ProviderDetectionRunner = async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 1, stdout: "", stderr: "" };
    };
    await detectAllProviders(runner);
    for (const call of calls) {
      expect(call.args).toContain("--version");
    }
  });

  it("missing Ollama includes an install command hint", async () => {
    const detections = await detectAllProviders(allMissing);
    const ollama = detections.find((d) => d.id === "ollama")!;
    expect(ollama.available).toBe(false);
    expect(ollama.notes.join("\n")).toMatch(/curl -fsSL https:\/\/ollama\.com\/install\.sh \| sh/);
  });

  it("installHintForCommand handles bare commands and absolute paths", () => {
    expect(installHintForCommand("ollama")).toMatch(/ollama\.com\/install\.sh/);
    expect(installHintForCommand("/opt/homebrew/bin/ollama")).toMatch(
      /ollama\.com\/install\.sh/,
    );
    expect(installHintForCommand("unknown")).toBeNull();
  });
});
