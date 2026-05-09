import { describe, it, expect } from "vitest";
import {
  detectAllProviders,
  detectProvider,
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

  it("flags Codex as detected-needs-setup (no verified preset)", async () => {
    const detections = await detectAllProviders(codexOnly);
    const codex = detections.find((d) => d.id === "codex")!;
    expect(codex.available).toBe(true);
    expect(codex.confidence).toBe("detected-needs-setup");
    expect(codex.recommended).toBe(false);
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

  it("pickRecommendedProvider returns the ready one or null", async () => {
    const ready = await detectAllProviders(claudeOk);
    expect(pickRecommendedProvider(ready)?.id).toBe("claude");

    const none = await detectAllProviders(codexOnly);
    expect(pickRecommendedProvider(none)).toBeNull();

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
    expect(summary.ready.map((d) => d.id)).toEqual(["claude"]);
    expect(summary.needsSetup.map((d) => d.id)).toEqual(["codex"]);
    expect(summary.missing.map((d) => d.id).sort()).toEqual(["aider", "opencode"]);
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
});
