import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadCatalogOverlay } from "../src/providers/provider-catalog-overlay.js";
import { resolveCatalog } from "../src/providers/provider-catalog-overlay.js";
import { modelSuggestions, effortLevels } from "../src/providers/provider-apply.js";
import { refreshCatalog } from "../src/providers/provider-probe.js";
import {
  parseCodexModels,
  detectProviderModels,
  modelProbeFamily,
  CapabilityProbeError,
} from "../src/providers/provider-model-detection.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
async function codexJson(): Promise<string> {
  return fs.readFile(path.join(fixtureDir, "codex-debug-models.json"), "utf8");
}

describe("parseCodexModels", () => {
  it("extracts selectable slugs + efforts from the real codex catalog", async () => {
    const caps = parseCodexModels(await codexJson());
    expect(caps).not.toBeNull();
    // visibility=="hide" (codex-auto-review) is excluded; the rest are listed.
    expect(caps!.models).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2",
    ]);
    expect(caps!.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(caps!.modelsRich[0]).toMatchObject({
      slug: "gpt-5.5",
      label: "GPT-5.5",
      defaultEffort: "medium",
    });
  });

  it("returns null on non-JSON / wrong shape / empty", () => {
    expect(parseCodexModels("not json")).toBeNull();
    expect(parseCodexModels('{"nope":1}')).toBeNull();
    expect(parseCodexModels('{"models":[]}')).toBeNull();
    expect(parseCodexModels('{"models":[{"visibility":"hide","slug":"x"}]}')).toBeNull();
  });
});

describe("detectProviderModels", () => {
  it("returns the catalog from the live probe", async () => {
    const json = await codexJson();
    const runner: ProviderDetectionRunner = async () => ({ exitCode: 0, stdout: json, stderr: "" });
    const r = await detectProviderModels({ providerId: "codex", command: "codex", family: "codex", runner });
    expect(r.catalog.models[0]).toBe("gpt-5.5");
    expect(r.source).toBe("codex debug models");
  });

  it("falls back to --bundled when the live probe fails", async () => {
    const json = await codexJson();
    let call = 0;
    const runner: ProviderDetectionRunner = async (_cmd, args) => {
      call++;
      if (args.includes("--bundled")) return { exitCode: 0, stdout: json, stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "network unavailable" };
    };
    const r = await detectProviderModels({ providerId: "codex", command: "codex", family: "codex", runner });
    expect(r.source).toContain("--bundled");
    expect(call).toBe(2);
  });

  it("throws CapabilityProbeError (with the real reason) when both attempts fail", async () => {
    const runner: ProviderDetectionRunner = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "codex: not logged in",
    });
    await expect(
      detectProviderModels({ providerId: "codex", command: "codex", family: "codex", runner }),
    ).rejects.toThrow(/not logged in/);
  });
});

describe("modelProbeFamily", () => {
  it("matches codex by id and by command basename, ignores others", () => {
    expect(modelProbeFamily("codex", { type: "cli", command: "codex", input: "stdin" } as never)).toBe("codex");
    expect(modelProbeFamily("my-codex", { type: "cli", command: "/usr/bin/codex", input: "stdin" } as never)).toBe("codex");
    expect(modelProbeFamily("gemini", { type: "cli", command: "gemini", input: "stdin" } as never)).toBeNull();
  });
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-modeldetect-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "providers.codex", JSON.stringify({ type: "cli", command: "codex", input: "stdin" }));
  return dir;
}

describe("refreshCatalog with the structured codex probe", () => {
  it("refreshes codex's stale built-in models from the real catalog and reports the delta", async () => {
    const dir = await makeProject();
    const json = await codexJson();
    const probe: ProviderDetectionRunner = async () => ({ exitCode: 0, stdout: json, stderr: "" });

    // Sanity: the stale built-in list is what we're replacing.
    expect(modelSuggestions("codex")).toContain("gpt-5.1");

    const r = await refreshCatalog(dir, { providerId: "codex", modelProbeRunner: probe });
    const f = r.findings.find((x) => x.providerId === "codex")!;
    expect(f.status).toBe("added");
    expect(f.source).toBe("codex debug models");
    expect(f.models).toEqual(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2"]);
    // Delta vs the stale built-in.
    expect(f.added).toContain("gpt-5.4");
    expect(f.removed).toContain("gpt-5.1");
    expect(r.wrote).toBe(true);

    // The overlay now carries the real models + codex's apply mechanics.
    const overlay = await loadCatalogOverlay(dir);
    expect(overlay.cli?.codex?.models).toContain("gpt-5.5");
    expect(overlay.cli?.codex?.model).toEqual({ kind: "flag", flag: "--model" });
    expect(overlay.cli?.codex?.effort?.apply).toEqual({
      kind: "config",
      flag: "-c",
      key: "model_reasoning_effort",
    });

    // And the resolved catalog (what the dropdowns read) reflects it.
    const resolved = await resolveCatalog(dir);
    expect(resolved.cli.codex?.models).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2",
    ]);
    expect(effortLevels("codex", resolved)).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("respects a hand-authored overlay entry unless --force", async () => {
    const dir = await makeProject();
    const json = await codexJson();
    const probe: ProviderDetectionRunner = async () => ({ exitCode: 0, stdout: json, stderr: "" });
    // User pinned their own models.
    await setConfigValue(dir, "providers.codex", JSON.stringify({ type: "cli", command: "codex", input: "stdin" }));
    const overlayPath = path.join(dir, ".vibestrate", "providers-catalog.yml");
    await fs.writeFile(overlayPath, "cli:\n  codex:\n    models: [my-pinned-model]\n");

    const kept = await refreshCatalog(dir, { providerId: "codex", modelProbeRunner: probe });
    expect(kept.findings[0]?.status).toBe("skipped-overlay");
    expect((await loadCatalogOverlay(dir)).cli?.codex?.models).toEqual(["my-pinned-model"]);

    const forced = await refreshCatalog(dir, { providerId: "codex", force: true, modelProbeRunner: probe });
    expect(forced.findings[0]?.status).toBe("added");
    expect((await loadCatalogOverlay(dir)).cli?.codex?.models).toContain("gpt-5.5");
  });

  it("keeps the catalog and reports the real reason when the probe fails", async () => {
    const dir = await makeProject();
    const failing: ProviderDetectionRunner = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "codex: not logged in. Run `codex login`.",
    });
    const r = await refreshCatalog(dir, { providerId: "codex", modelProbeRunner: failing });
    expect(r.findings[0]?.status).toBe("probe-failed");
    expect(r.findings[0]?.detail).toMatch(/not logged in/);
    expect(r.wrote).toBe(false);
    // The curated built-in still stands.
    expect((await loadCatalogOverlay(dir)).cli?.codex).toBeUndefined();
  });
});
