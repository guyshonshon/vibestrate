import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInit } from "../src/project/init-template.js";
import {
  ensureProvider,
  createProfile,
  setProfileFields,
} from "../src/setup/config-update-service.js";
import {
  loadCatalogKnowledge,
  judgeModel,
} from "../src/providers/provider-model-validation.js";

/**
 * A profile carrying a model its provider does not have is a run that fails at
 * launch, and the write path used to accept it: `provider: codex` with
 * `model: claude-haiku-4-5-20251001` reached project.yml and only surfaced when
 * a run tried to spawn.
 *
 * The two halves of the rule are what these defend:
 *   - a DERIVED list (the provider's own probed catalog, or a user overlay) is
 *     evidence, so a value outside it is refused;
 *   - a CURATED built-in list is a guess that goes stale the day a provider
 *     ships a model, so a value outside it is allowed and reported unverified.
 * Getting the second half wrong would block every new model on release day,
 * which is why "reject everything unknown" is not the answer here.
 */

let root: string;

/** The shape provider-model-autodetect writes at the start of every run. */
async function writeDetected(models: string[]): Promise<void> {
  await mkdir(path.join(root, ".vibestrate"), { recursive: true });
  await writeFile(
    path.join(root, ".vibestrate", "providers-detected.json"),
    JSON.stringify({
      schemaVersion: 1,
      providers: {
        codex: {
          models,
          efforts: ["low", "high"],
          detectedAt: new Date(0).toISOString(),
          binaryVersion: "0.144.3",
          source: "codex debug models --bundled",
        },
      },
    }),
  );
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "vibe-model-"));
  await runInit({ projectRoot: root });
  await ensureProvider(root, "codex", {
    type: "cli",
    command: "codex",
    args: [],
    input: "stdin",
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("judgeModel", () => {
  it("accepts a model the provider's own probe reported", async () => {
    await writeDetected(["gpt-5.5", "gpt-5.4"]);
    const k = await loadCatalogKnowledge(root);
    expect(judgeModel(k, "codex", "gpt-5.5")).toEqual({
      code: "ok",
      source: "detected",
    });
  });

  it("rejects a model absent from a probed catalog", async () => {
    await writeDetected(["gpt-5.5"]);
    const k = await loadCatalogKnowledge(root);
    const v = judgeModel(k, "codex", "claude-haiku-4-5-20251001");
    expect(v.code).toBe("unknown-model");
  });

  it("reports a model absent from a merely curated list as unverified, not wrong", async () => {
    // No detected cache and no overlay: all we have is the built-in guess.
    const k = await loadCatalogKnowledge(root);
    const v = judgeModel(k, "codex", "gpt-6-not-shipped-yet");
    expect(v.code).toBe("unverified");
  });

  it("has nothing to say about an unset model", async () => {
    await writeDetected(["gpt-5.5"]);
    const k = await loadCatalogKnowledge(root);
    expect(judgeModel(k, "codex", null).code).toBe("not-applicable");
    expect(judgeModel(k, "codex", "  ").code).toBe("not-applicable");
  });

  it("drift: a model that was fine becomes unknown when the provider drops it", async () => {
    await writeDetected(["gpt-5.5", "gpt-5.4"]);
    expect(judgeModel(await loadCatalogKnowledge(root), "codex", "gpt-5.4").code).toBe(
      "ok",
    );
    // The provider ships a build without it - nobody touched the config.
    await writeDetected(["gpt-5.5"]);
    expect(judgeModel(await loadCatalogKnowledge(root), "codex", "gpt-5.4").code).toBe(
      "unknown-model",
    );
  });
});

describe("the profile write path", () => {
  it("refuses to create a profile on a model the provider does not have", async () => {
    await writeDetected(["gpt-5.5"]);
    await expect(
      createProfile(root, "bad", {
        provider: "codex",
        label: "bad",
        model: "claude-haiku-4-5-20251001",
      }),
    ).rejects.toThrow(/no model called/i);
    const yml = await readFile(path.join(root, ".vibestrate", "project.yml"), "utf8");
    expect(yml).not.toContain("claude-haiku-4-5-20251001");
  });

  it("creates a profile on a model the provider does have", async () => {
    await writeDetected(["gpt-5.5"]);
    await createProfile(root, "good", {
      provider: "codex",
      label: "good",
      model: "gpt-5.5",
    });
    const yml = await readFile(path.join(root, ".vibestrate", "project.yml"), "utf8");
    expect(yml).toContain("gpt-5.5");
  });

  it("judges a patch by the pair it would LEAVE on disk, not by what the patch carries", async () => {
    await writeDetected(["gpt-5.5"]);
    await createProfile(root, "p", {
      provider: "codex",
      label: "p",
      model: "gpt-5.5",
    });
    // Patching only the model must still see the provider already on disk.
    await expect(
      setProfileFields(root, "p", { model: "claude-haiku-4-5-20251001" }),
    ).rejects.toThrow(/no model called/i);
    // ...and patching only the provider must still see the model already on disk.
    await writeDetected(["gpt-5.5"]);
    await expect(
      setProfileFields(root, "p", { model: "gpt-5.4" }),
    ).rejects.toThrow(/no model called/i);
  });

  it("lets a new model through when there is no derived list to contradict it", async () => {
    await setProfileFields(root, "fresh", {
      provider: "codex",
      label: "fresh",
      model: "gpt-6-not-shipped-yet",
    });
    const yml = await readFile(path.join(root, ".vibestrate", "project.yml"), "utf8");
    expect(yml).toContain("gpt-6-not-shipped-yet");
  });
});
