import { describe, it, expect } from "vitest";
import { runCliProvider } from "../src/providers/cli-provider.js";
import type { CliProviderConfig } from "../src/providers/provider-schema.js";

// `true` is a no-op binary that ignores argv and exits 0 - lets us assert the
// args the cli provider actually assembled for the spawn.
const noop: CliProviderConfig = {
  type: "cli",
  command: "true",
  args: ["exec"],
  input: "stdin",
};

describe("runCliProvider applies the profile's model + effort to the spawn", () => {
  it("codex: injects --model and -c model_reasoning_effort", async () => {
    const r = await runCliProvider(noop, {
      providerId: "codex",
      prompt: "hi",
      cwd: process.cwd(),
      model: "gpt-5-codex",
      effort: "high",
    });
    expect(r.args).toEqual([
      "exec",
      "--model",
      "gpt-5-codex",
      "-c",
      "model_reasoning_effort=high",
    ]);
  });

  it("no knobs -> args unchanged from the preset", async () => {
    const r = await runCliProvider(noop, {
      providerId: "codex",
      prompt: "hi",
      cwd: process.cwd(),
    });
    expect(r.args).toEqual(["exec"]);
  });
});
