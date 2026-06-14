import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applySetup } from "../src/setup/setup-service.js";
import {
  installCrewPreset,
  setConfigValue,
  createProfile,
  setCrewRoleFields,
} from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

async function initedProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-presets-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
  );
  await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "");
  await applySetup({ options: { projectRoot: root }, detectionRunner: claudeOk });
  return root;
}

describe("installCrewPreset", () => {
  let root: string;
  beforeEach(async () => {
    root = await initedProject();
  });

  it("adds a fast crew + profile; config stays valid; roster mirrors default", async () => {
    const res = await installCrewPreset(root, "fast");
    expect(res.crewId).toBe("fast");
    expect(res.profileId).toBe("claude-fast");
    expect(res.ref).toBe("claude");

    const { config } = await loadConfig(root); // loadConfig validates against the schema
    expect(config.profiles["claude-fast"]?.provider).toBe("claude");
    expect(config.crews.fast).toBeDefined();
    expect(Object.keys(config.crews.fast!.roles).sort()).toEqual(
      Object.keys(config.crews[config.defaultCrew]!.roles).sort(),
    );
    for (const role of Object.values(config.crews.fast!.roles)) {
      expect(role.profile).toBe("claude-fast");
    }
  });

  it("is additive: refuses to overwrite an existing crew/profile", async () => {
    await installCrewPreset(root, "fast");
    await expect(installCrewPreset(root, "fast")).rejects.toThrow(/already exists/i);
  });

  it("thorough installs without changing the default crew", async () => {
    await installCrewPreset(root, "thorough");
    const { config } = await loadConfig(root);
    expect(config.crews.thorough).toBeDefined();
    expect(config.defaultCrew).not.toBe("thorough");
    // the original default crew is untouched
    expect(config.crews[config.defaultCrew]).toBeDefined();
  });

  it("fast / thorough write per-crew maxReviewLoops overrides (1 / 3)", async () => {
    await installCrewPreset(root, "fast");
    await installCrewPreset(root, "thorough");
    const { config } = await loadConfig(root);
    expect(config.crews.fast!.maxReviewLoops).toBe(1);
    expect(config.crews.thorough!.maxReviewLoops).toBe(3);
    // the default crew keeps no override (inherits the global).
    expect(config.crews[config.defaultCrew]!.maxReviewLoops).toBeUndefined();
  });

  it("cheap installs the provider's cheapest model (claude -> haiku), no loop override", async () => {
    const res = await installCrewPreset(root, "cheap");
    expect(res.model).toBe("haiku");
    expect(res.maxReviewLoops).toBeNull();
    const { config } = await loadConfig(root);
    expect(config.profiles["claude-cheap"]?.model).toBe("haiku");
    expect(config.crews.cheap!.maxReviewLoops).toBeUndefined();
  });

  it("local refuses on a single local-provider project (would equal default)", async () => {
    await expect(installCrewPreset(root, "local")).rejects.toThrow(/already runs on a local/i);
  });

  it("refuses on a provider with no distinct effort levels (would be identical)", async () => {
    // Point the default crew at gemini, which exposes no effort control - so
    // fast/thorough would be byte-identical to the default. Install must refuse.
    await setConfigValue(
      root,
      "providers.gemini",
      JSON.stringify({ type: "cli", command: "gemini", args: [], input: "stdin" }),
    );
    await createProfile(root, "gemini-balanced", { provider: "gemini" });
    const { config: pre } = await loadConfig(root);
    // deriveProviderRef reads the default crew's first role - repoint it.
    const firstRole = Object.keys(pre.crews[pre.defaultCrew]!.roles)[0]!;
    await setCrewRoleFields(root, pre.defaultCrew, firstRole, {
      profile: "gemini-balanced",
    });

    await expect(installCrewPreset(root, "fast")).rejects.toThrow(/effort/i);
    const { config } = await loadConfig(root);
    expect(config.crews.fast).toBeUndefined();
    expect(config.profiles["gemini-fast"]).toBeUndefined();
  });

  it("preserves the existing config (default crew + balanced profile intact)", async () => {
    const before = (await loadConfig(root)).config;
    await installCrewPreset(root, "fast");
    const after = (await loadConfig(root)).config;
    expect(after.defaultCrew).toBe(before.defaultCrew);
    expect(after.profiles["claude-balanced"]).toEqual(before.profiles["claude-balanced"]);
    expect(after.crews[after.defaultCrew]).toEqual(before.crews[before.defaultCrew]);
  });
});
