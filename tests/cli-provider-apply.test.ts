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
    expect(r.appliedSandbox ?? null).toBeNull();
  });
});

describe("runCliProvider injects a provider-native OS sandbox (codex only)", () => {
  it("codex: --sandbox lands after the subcommand, before model/effort, and is reported applied", async () => {
    const r = await runCliProvider(noop, {
      providerId: "codex",
      prompt: "hi",
      cwd: process.cwd(),
      sandbox: "workspace-write",
      model: "gpt-5-codex",
      effort: "high",
    });
    expect(r.args).toEqual([
      "exec",
      "--sandbox",
      "workspace-write",
      "--model",
      "gpt-5-codex",
      "-c",
      "model_reasoning_effort=high",
    ]);
    expect(r.appliedSandbox).toBe("workspace-write");
  });

  it("read-only seat -> --sandbox read-only", async () => {
    const r = await runCliProvider(noop, {
      providerId: "codex",
      prompt: "hi",
      cwd: process.cwd(),
      sandbox: "read-only",
    });
    expect(r.args).toEqual(["exec", "--sandbox", "read-only"]);
    expect(r.appliedSandbox).toBe("read-only");
  });

  it("non-codex provider: no --sandbox flag, and NOT reported as sandboxed", async () => {
    const r = await runCliProvider(noop, {
      providerId: "gemini",
      prompt: "hi",
      cwd: process.cwd(),
      sandbox: "workspace-write",
      model: "gemini-2.5-pro",
    });
    expect(r.args).toEqual(["exec", "--model", "gemini-2.5-pro"]);
    expect(r.appliedSandbox ?? null).toBeNull();
  });
});
