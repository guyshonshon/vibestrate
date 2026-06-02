import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  loadCatalogOverlay,
  mergeCatalog,
  resolveCatalog,
} from "../src/providers/provider-catalog-overlay.js";
import {
  BUILTIN_CATALOG,
  effortLevels,
  profileSpawnArgs,
  httpEffortLevels,
  applyHttpEffort,
} from "../src/providers/provider-apply.js";

async function tmpProject(overlayYaml?: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-overlay-"));
  await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
  if (overlayYaml !== undefined) {
    await fs.writeFile(
      path.join(dir, ".vibestrate", "providers-catalog.yml"),
      overlayYaml,
    );
  }
  return dir;
}

describe("loadCatalogOverlay", () => {
  it("returns {} when there is no overlay file", async () => {
    const dir = await tmpProject();
    expect(await loadCatalogOverlay(dir)).toEqual({});
  });

  it("parses a valid overlay", async () => {
    const dir = await tmpProject(
      [
        "cli:",
        "  mycli:",
        "    models: [turbo, eco]",
        "    model: { kind: flag, flag: --model }",
        "    effort:",
        "      levels: [eco, turbo]",
        "      apply: { kind: config, flag: --set, key: reasoning }",
      ].join("\n"),
    );
    const overlay = await loadCatalogOverlay(dir);
    expect(overlay.cli?.mycli?.models).toEqual(["turbo", "eco"]);
    expect(overlay.cli?.mycli?.effort?.levels).toEqual(["eco", "turbo"]);
  });

  it("throws on an unknown apply kind (no fabricated mechanisms)", async () => {
    const dir = await tmpProject(
      ["cli:", "  mycli:", "    model: { kind: telepathy }"].join("\n"),
    );
    await expect(loadCatalogOverlay(dir)).rejects.toThrow(/Invalid provider catalog/);
  });
});

describe("mergeCatalog", () => {
  it("adds a brand-new CLI provider with its own apply-spec", () => {
    const merged = mergeCatalog({
      cli: {
        mycli: {
          models: ["turbo"],
          model: { kind: "flag", flag: "--model" },
          effort: { levels: ["eco", "turbo"], apply: { kind: "flag", flag: "--effort" } },
        },
      },
    });
    expect(effortLevels("mycli", merged)).toEqual(["eco", "turbo"]);
    expect(profileSpawnArgs("mycli", { model: "turbo", effort: "turbo" }, merged)).toEqual([
      "--model",
      "turbo",
      "--effort",
      "turbo",
    ]);
    // built-in providers still resolve
    expect(effortLevels("claude", merged)).toEqual(effortLevels("claude"));
  });

  it("per-field override keeps untouched built-in fields", () => {
    const merged = mergeCatalog({ cli: { codex: { models: ["only-this"] } } });
    expect(merged.cli.codex!.models).toEqual(["only-this"]);
    // effort spec untouched -> still the built-in codex levels
    expect(effortLevels("codex", merged)).toEqual(effortLevels("codex"));
  });

  it("explicit null clears a built-in knob", () => {
    const merged = mergeCatalog({ cli: { codex: { effort: null } } });
    expect(effortLevels("codex", merged)).toEqual([]);
  });

  it("can extend an HTTP api family's effort", () => {
    const merged = mergeCatalog({
      http: { openai: { effort: { levels: ["low", "high"], field: "reasoning_effort" } } },
    });
    expect(httpEffortLevels("openai", merged)).toEqual(["low", "high"]);
    const body: Record<string, unknown> = { model: "x" };
    applyHttpEffort("openai", body, "high", merged);
    expect(body.reasoning_effort).toBe("high");
  });

  it("does not mutate the built-in catalog", () => {
    const before = effortLevels("codex");
    mergeCatalog({ cli: { codex: { effort: null } } });
    expect(effortLevels("codex")).toEqual(before);
    expect(BUILTIN_CATALOG.cli.codex!.effort).not.toBeNull();
  });
});

describe("resolveCatalog (load + merge from disk)", () => {
  it("reflects a written overlay", async () => {
    const dir = await tmpProject(
      ["cli:", "  gemini:", "    effort:", "      levels: [think]", "      apply: { kind: flag, flag: --reason }"].join("\n"),
    );
    const resolved = await resolveCatalog(dir);
    // built-in gemini had NO effort; overlay adds one
    expect(effortLevels("gemini", resolved)).toEqual(["think"]);
    expect(profileSpawnArgs("gemini", { effort: "think" }, resolved)).toEqual([
      "--reason",
      "think",
    ]);
  });

  it("falls back to built-in when there is no overlay", async () => {
    const dir = await tmpProject();
    const resolved = await resolveCatalog(dir);
    expect(effortLevels("gemini", resolved)).toEqual([]);
  });
});
