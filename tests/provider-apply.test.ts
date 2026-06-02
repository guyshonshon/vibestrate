import { describe, it, expect } from "vitest";
import {
  profileSpawnArgs,
  effortLevels,
  modelIsWired,
  httpEffortLevels,
  httpModelSuggestions,
  applyHttpEffort,
} from "../src/providers/provider-apply.js";

describe("provider-apply: wired capabilities", () => {
  it("effort levels are the real CLI levels, or empty when not wired", () => {
    expect(effortLevels("claude")).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(effortLevels("codex")).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
    expect(effortLevels("gemini")).toEqual([]); // no effort flag -> hidden
    expect(effortLevels("ollama")).toEqual([]);
    expect(effortLevels("unknown")).toEqual([]);
  });

  it("model is wired only where there is a real --model flag", () => {
    expect(modelIsWired("claude")).toBe(true);
    expect(modelIsWired("codex")).toBe(true);
    expect(modelIsWired("gemini")).toBe(true);
    expect(modelIsWired("ollama")).toBe(false);
    expect(modelIsWired("unknown")).toBe(false);
  });
});

describe("profileSpawnArgs (generic-CLI path)", () => {
  it("codex: --model + -c model_reasoning_effort", () => {
    expect(profileSpawnArgs("codex", { model: "gpt-5-codex", effort: "high" })).toEqual([
      "--model",
      "gpt-5-codex",
      "-c",
      "model_reasoning_effort=high",
    ]);
  });

  it("gemini: model wired, effort not (no flag emitted)", () => {
    expect(profileSpawnArgs("gemini", { model: "gemini-2.5-pro", effort: "high" })).toEqual([
      "--model",
      "gemini-2.5-pro",
    ]);
  });

  it("unwired provider / no knobs -> nothing", () => {
    expect(profileSpawnArgs("ollama", { model: "x", effort: "high" })).toEqual([]);
    expect(profileSpawnArgs("codex", {})).toEqual([]);
  });
});

describe("http-api apply layer (request body, by api family)", () => {
  it("effort levels: openai is real, anthropic/ollama have none", () => {
    expect(httpEffortLevels("openai")).toEqual(["minimal", "low", "medium", "high"]);
    expect(httpEffortLevels("anthropic")).toEqual([]); // thinking is a budget, not a level
    expect(httpEffortLevels("ollama")).toEqual([]);
    expect(httpEffortLevels("unknown")).toEqual([]);
  });

  it("model suggestions exist per api (model itself is always free-text)", () => {
    expect(httpModelSuggestions("openai").length).toBeGreaterThan(0);
    expect(httpModelSuggestions("ollama")).toEqual([]);
  });

  it("applyHttpEffort sets reasoning_effort only for openai + only when set", () => {
    const body: Record<string, unknown> = { model: "gpt-5.5" };
    applyHttpEffort("openai", body, "high");
    expect(body.reasoning_effort).toBe("high");

    const noEffort: Record<string, unknown> = { model: "gpt-5.5" };
    applyHttpEffort("openai", noEffort, null);
    expect(noEffort).not.toHaveProperty("reasoning_effort");

    const anthropic: Record<string, unknown> = { model: "claude-sonnet-4-5" };
    applyHttpEffort("anthropic", anthropic, "high");
    expect(anthropic).not.toHaveProperty("reasoning_effort");
  });
});
