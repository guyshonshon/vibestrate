import { describe, it, expect } from "vitest";
import {
  profileSpawnArgs,
  effortLevels,
  modelIsWired,
} from "../src/providers/provider-apply.js";

describe("provider-apply: wired capabilities", () => {
  it("effort levels are the real CLI levels, or empty when not wired", () => {
    expect(effortLevels("claude")).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(effortLevels("codex")).toEqual(["minimal", "low", "medium", "high"]);
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
