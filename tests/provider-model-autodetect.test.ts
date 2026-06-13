import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { resolveCatalog } from "../src/providers/provider-catalog-overlay.js";
import { effortLevels } from "../src/providers/provider-apply.js";
import { autoDetectRunModels } from "../src/providers/provider-model-autodetect.js";
import {
  loadDetectedCache,
  mergeDetected,
  type DetectedCache,
} from "../src/providers/provider-detected-store.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
async function codexJson(): Promise<string> {
  return fs.readFile(path.join(fixtureDir, "codex-debug-models.json"), "utf8");
}

async function makeProject(withCodex = true): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-autodetect-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  if (withCodex) {
    await setConfigValue(dir, "providers.codex", JSON.stringify({ type: "cli", command: "codex", input: "stdin" }));
  }
  return dir;
}

/** A bundled-only fake: only answers `debug models --bundled` (+ --version). */
function bundledRunner(json: string, version = "codex-cli 0.134.0"): ProviderDetectionRunner {
  return async (_cmd, args) => {
    if (args.includes("--version")) return { exitCode: 0, stdout: version, stderr: "" };
    if (args.includes("--bundled")) return { exitCode: 0, stdout: json, stderr: "" };
    // Run-start auto-detect must NOT hit the live (network) form.
    return { exitCode: 1, stdout: "", stderr: "live probe should not be called at run start" };
  };
}

describe("autoDetectRunModels", () => {
  it("writes the detected cache from the bundled catalog (never the live form)", async () => {
    const dir = await makeProject();
    const r = await autoDetectRunModels({
      projectRoot: dir,
      runner: bundledRunner(await codexJson()),
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(r.updated).toBe(true);
    expect(r.detail).toMatch(/codex/);
    const cache = await loadDetectedCache(dir);
    expect(cache.providers.codex?.models).toContain("gpt-5.5");
    expect(cache.providers.codex?.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(cache.providers.codex?.detectedAt).toBe("2026-06-13T00:00:00.000Z");
    expect(cache.providers.codex?.binaryVersion).toBe("0.134.0");
  });

  it("is a no-op (no rewrite) when nothing changed", async () => {
    const dir = await makeProject();
    const json = await codexJson();
    await autoDetectRunModels({ projectRoot: dir, runner: bundledRunner(json), now: "t1" });
    const first = await loadDetectedCache(dir);
    const second = await autoDetectRunModels({
      projectRoot: dir,
      runner: bundledRunner(json),
      now: "t2",
    });
    expect(second.updated).toBe(false);
    expect(second.detail).toMatch(/up to date/);
    // The detectedAt timestamp is unchanged (no rewrite -> no churn).
    expect((await loadDetectedCache(dir)).providers.codex?.detectedAt).toBe(
      first.providers.codex?.detectedAt,
    );
  });

  it("reports added/removed when the catalog changes", async () => {
    const dir = await makeProject();
    await autoDetectRunModels({ projectRoot: dir, runner: bundledRunner(await codexJson()), now: "t1" });
    // A later codex ships a new model and drops an old one.
    const shifted = JSON.stringify({
      models: [
        { slug: "gpt-5.6", display_name: "GPT-5.6", visibility: "list", supported_in_api: true, supported_reasoning_levels: [{ effort: "high" }] },
        { slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list", supported_in_api: true, supported_reasoning_levels: [{ effort: "high" }] },
      ],
    });
    const r = await autoDetectRunModels({ projectRoot: dir, runner: bundledRunner(shifted), now: "t2" });
    expect(r.updated).toBe(true);
    const codex = r.perProvider.find((p) => p.providerId === "codex")!;
    expect(codex.added).toContain("gpt-5.6");
    expect(codex.removed).toContain("gpt-5.4");
  });

  it("fails open: a missing/erroring binary never throws and leaves the cache intact", async () => {
    const dir = await makeProject();
    const failing: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "command not found" });
    const r = await autoDetectRunModels({ projectRoot: dir, runner: failing });
    expect(r.updated).toBe(false);
    expect(r.perProvider[0]?.error).toBeTruthy();
    // No cache file written.
    const cache = await loadDetectedCache(dir);
    expect(cache.providers.codex).toBeUndefined();
  });

  it("no-ops instantly when no probe-capable provider is configured", async () => {
    const dir = await makeProject(false);
    const r = await autoDetectRunModels({ projectRoot: dir, runner: bundledRunner(await codexJson()) });
    expect(r.updated).toBe(false);
    expect(r.detail).toBe("nothing to probe");
  });
});

describe("merge precedence: built-in < detected cache < user overlay", () => {
  it("the cache refreshes built-in, and a hand overlay still wins", async () => {
    const dir = await makeProject();
    // Run-start auto-detect populates the cache.
    await autoDetectRunModels({ projectRoot: dir, runner: bundledRunner(await codexJson()), now: "t1" });
    let resolved = await resolveCatalog(dir);
    expect(resolved.cli.codex?.models).toContain("gpt-5.5");
    expect(resolved.cli.codex?.models).not.toContain("gpt-5.1"); // stale built-in refreshed
    expect(effortLevels("codex", resolved)).toEqual(["low", "medium", "high", "xhigh"]);

    // A hand-authored overlay entry overrides the cache.
    await fs.writeFile(
      path.join(dir, ".vibestrate", "providers-catalog.yml"),
      "cli:\n  codex:\n    models: [my-pinned]\n",
    );
    resolved = await resolveCatalog(dir);
    expect(resolved.cli.codex?.models).toEqual(["my-pinned"]);
  });

  it("mergeDetected keeps the built-in apply mechanics", () => {
    const cache: DetectedCache = {
      schemaVersion: 1,
      providers: { codex: { models: ["gpt-5.5"], efforts: ["high"], detectedAt: "t", binaryVersion: null, source: "x" } },
    };
    const merged = mergeDetected(cache);
    expect(merged.cli.codex?.model).toEqual({ kind: "flag", flag: "--model" });
    expect(merged.cli.codex?.effort?.apply).toEqual({ kind: "config", flag: "-c", key: "model_reasoning_effort" });
    expect(merged.cli.codex?.effort?.levels).toEqual(["high"]);
  });
});
