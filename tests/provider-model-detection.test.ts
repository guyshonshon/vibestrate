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
import { loadDetectedCache } from "../src/providers/provider-detected-store.js";
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

    // Detected models land in the CACHE, not the overlay (one detected layer,
    // shared with run-start auto-detect - so they never shadow each other).
    expect((await loadCatalogOverlay(dir)).cli?.codex).toBeUndefined();
    const cache = await loadDetectedCache(dir);
    expect(cache.providers.codex?.models).toContain("gpt-5.5");
    expect(cache.providers.codex?.efforts).toEqual(["low", "medium", "high", "xhigh"]);

    // And the resolved catalog (what the dropdowns read) reflects it, with
    // codex's apply mechanics single-sourced from the built-in.
    const resolved = await resolveCatalog(dir);
    expect(resolved.cli.codex?.model).toEqual({ kind: "flag", flag: "--model" });
    expect(resolved.cli.codex?.effort?.apply).toEqual({
      kind: "config",
      flag: "-c",
      key: "model_reasoning_effort",
    });
    expect(resolved.cli.codex?.models).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2",
    ]);
    expect(effortLevels("codex", resolved)).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("a hand-authored overlay always wins over detection (which refreshes the cache underneath)", async () => {
    const dir = await makeProject();
    const json = await codexJson();
    const probe: ProviderDetectionRunner = async () => ({ exitCode: 0, stdout: json, stderr: "" });
    // User pinned their own model in the overlay (genuine hand authoring).
    const overlayPath = path.join(dir, ".vibestrate", "providers-catalog.yml");
    await fs.writeFile(overlayPath, "cli:\n  codex:\n    models: [my-pinned-model]\n");

    const r = await refreshCatalog(dir, { providerId: "codex", modelProbeRunner: probe });
    expect(r.findings[0]?.status).toBe("added"); // detection ran + cached
    // The overlay is untouched and still wins in the resolved catalog...
    expect((await loadCatalogOverlay(dir)).cli?.codex?.models).toEqual(["my-pinned-model"]);
    expect((await resolveCatalog(dir)).cli.codex?.models).toEqual(["my-pinned-model"]);
    // ...but the cache underneath was refreshed, so removing the pin reveals it.
    expect((await loadDetectedCache(dir)).providers.codex?.models).toContain("gpt-5.5");
    await fs.rm(overlayPath);
    expect((await resolveCatalog(dir)).cli.codex?.models).toContain("gpt-5.5");
  });

  it("explicit refresh and run-start auto-detect share one layer - no shadow, newest wins", async () => {
    const { autoDetectRunModels } = await import("../src/providers/provider-model-autodetect.js");
    const dir = await makeProject();
    // An explicit `vibe provider refresh` caches an older catalog.
    const older = JSON.stringify({
      models: [{ slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list", supported_in_api: true, supported_reasoning_levels: [{ effort: "high" }] }],
    });
    await refreshCatalog(dir, {
      providerId: "codex",
      modelProbeRunner: async () => ({ exitCode: 0, stdout: older, stderr: "" }),
    });
    expect((await resolveCatalog(dir)).cli.codex?.models).toEqual(["gpt-5.5"]);

    // Later, run-start auto-detect (bundled) finds a NEWER model. Because both
    // write the same cache (no overlay shadow), the new model shows immediately.
    const newer = JSON.stringify({
      models: [
        { slug: "gpt-5.6", display_name: "GPT-5.6", visibility: "list", supported_in_api: true, supported_reasoning_levels: [{ effort: "high" }] },
        { slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list", supported_in_api: true, supported_reasoning_levels: [{ effort: "high" }] },
      ],
    });
    await autoDetectRunModels({
      projectRoot: dir,
      runner: async (_c, args) =>
        args.includes("--version")
          ? { exitCode: 0, stdout: "codex-cli 0.140.0", stderr: "" }
          : { exitCode: 0, stdout: newer, stderr: "" },
      now: "t2",
    });
    expect((await resolveCatalog(dir)).cli.codex?.models).toContain("gpt-5.6");
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
