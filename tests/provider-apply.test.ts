import { describe, it, expect } from "vitest";
import { profileSpawnArgs } from "../src/providers/provider-apply.js";

describe("profileSpawnArgs", () => {
  it("codex: model as --model, effort as -c model_reasoning_effort", () => {
    expect(
      profileSpawnArgs("codex", { model: "gpt-5-codex", effort: "high" }),
    ).toEqual(["--model", "gpt-5-codex", "-c", "model_reasoning_effort=high"]);
  });

  it("codex: only the knobs that are set are applied", () => {
    expect(profileSpawnArgs("codex", { effort: "medium" })).toEqual([
      "-c",
      "model_reasoning_effort=medium",
    ]);
    expect(profileSpawnArgs("codex", { model: "o3" })).toEqual(["--model", "o3"]);
  });

  it("claude / gemini: model wired, effort advisory (no flag)", () => {
    expect(profileSpawnArgs("claude", { model: "sonnet", effort: "high" })).toEqual([
      "--model",
      "sonnet",
    ]);
    expect(profileSpawnArgs("gemini", { model: "gemini-2.5-pro", effort: "x" })).toEqual([
      "--model",
      "gemini-2.5-pro",
    ]);
  });

  it("unknown provider or no knobs -> nothing (value stays advisory)", () => {
    expect(profileSpawnArgs("some-cli", { model: "x", effort: "high" })).toEqual([]);
    expect(profileSpawnArgs("codex", {})).toEqual([]);
  });
});
