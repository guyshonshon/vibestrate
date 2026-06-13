import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadCatalogOverlay } from "../src/providers/provider-catalog-overlay.js";
import {
  parseHelpForKnobs,
  extractChoices,
  refreshCatalog,
  type HelpRunner,
} from "../src/providers/provider-probe.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

describe("extractChoices", () => {
  it("handles <a|b|c>, [a|b|c], {a,b,c}, and (choices: …)", () => {
    expect(extractChoices("--effort <low|medium|high>")).toEqual(["low", "medium", "high"]);
    expect(extractChoices("[eco|turbo]")).toEqual(["eco", "turbo"]);
    expect(extractChoices("{a,b,c}")).toEqual(["a", "b", "c"]);
    expect(extractChoices('(choices: "minimal", "low", "high")')).toEqual([
      "minimal",
      "low",
      "high",
    ]);
  });

  it("rejects prose / non-identifier tokens", () => {
    expect(extractChoices("the effort to spend on this")).toEqual([]);
  });
});

describe("parseHelpForKnobs", () => {
  it("finds a commander-style effort flag with choices", () => {
    const help = [
      "Usage: mycli [options]",
      "Options:",
      "  --model <id>            model to use",
      "  --reasoning-effort <eco|turbo>   how hard to think",
    ].join("\n");
    const k = parseHelpForKnobs(help);
    expect(k.effort).toEqual({ flag: "--reasoning-effort", levels: ["eco", "turbo"] });
    expect(k.modelFlag).toBe("--model");
    expect(k.models).toEqual([]); // free-text model id, no enumerated choices
  });

  it("captures enumerated model choices when present", () => {
    const help = "  --model (choices: fast, smart)   pick a model";
    const k = parseHelpForKnobs(help);
    expect(k.modelFlag).toBe("--model");
    expect(k.models).toEqual(["fast", "smart"]);
  });

  it("returns nothing for help with no knobs", () => {
    expect(parseHelpForKnobs("Usage: tool\n  --verbose  be loud")).toEqual({ models: [] });
  });
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-probe-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

// A fake `--help` source keyed by command.
const HELP: Record<string, string> = {
  mycli: "Options:\n  --model <id>\n  --effort <eco|turbo>\n",
  // gemini is a built-in-wired CLI with NO structured model probe, so it still
  // goes through the --help gap-fill path (codex now uses `debug models`).
  gemini: "Options:\n  --model <id>\n  --effort <low|high>\n",
  boring: "Options:\n  --verbose\n",
};
const fakeRunner: HelpRunner = async (command) => ({
  exitCode: 0,
  stdout: HELP[command] ?? "",
  stderr: "",
});

describe("refreshCatalog (gap-fill, fake runner)", () => {
  it("adds an unknown provider's knobs to the overlay and writes the file", async () => {
    const dir = await makeProject();
    await setConfigValue(
      dir,
      "providers.mycli",
      JSON.stringify({ type: "cli", command: "mycli", input: "stdin" }),
    );
    const r = await refreshCatalog(dir, { runner: fakeRunner });
    expect(r.wrote).toBe(true);
    const added = r.findings.find((f) => f.providerId === "mycli");
    expect(added?.status).toBe("added");

    const overlay = await loadCatalogOverlay(dir);
    expect(overlay.cli?.mycli?.effort?.levels).toEqual(["eco", "turbo"]);
    expect(overlay.cli?.mycli?.effort?.apply).toEqual({ kind: "flag", flag: "--effort" });
    expect(overlay.cli?.mycli?.model).toEqual({ kind: "flag", flag: "--model" });
  });

  it("does NOT override a built-in spec (gemini, --help path) without --force", async () => {
    const dir = await makeProject();
    await setConfigValue(
      dir,
      "providers.gemini",
      JSON.stringify({ type: "cli", command: "gemini", input: "stdin" }),
    );
    const r = await refreshCatalog(dir, { providerId: "gemini", runner: fakeRunner });
    expect(r.findings[0]?.status).toBe("skipped-builtin");
    expect(r.wrote).toBe(false);
    expect((await loadCatalogOverlay(dir)).cli?.gemini).toBeUndefined();
  });

  it("force overrides the built-in spec (--help path)", async () => {
    const dir = await makeProject();
    await setConfigValue(
      dir,
      "providers.gemini",
      JSON.stringify({ type: "cli", command: "gemini", input: "stdin" }),
    );
    const r = await refreshCatalog(dir, { providerId: "gemini", force: true, runner: fakeRunner });
    expect(r.findings[0]?.status).toBe("added");
    expect((await loadCatalogOverlay(dir)).cli?.gemini?.effort?.levels).toEqual(["low", "high"]);
  });

  it("dry-run reports but writes nothing", async () => {
    const dir = await makeProject();
    await setConfigValue(
      dir,
      "providers.mycli",
      JSON.stringify({ type: "cli", command: "mycli", input: "stdin" }),
    );
    const r = await refreshCatalog(dir, { dryRun: true, runner: fakeRunner });
    expect(r.findings.find((f) => f.providerId === "mycli")?.status).toBe("added");
    expect(r.wrote).toBe(false);
    expect((await loadCatalogOverlay(dir)).cli?.mycli).toBeUndefined();
  });

  it("reports nothing-found when --help has no knobs", async () => {
    const dir = await makeProject();
    await setConfigValue(
      dir,
      "providers.boring",
      JSON.stringify({ type: "cli", command: "boring", input: "stdin" }),
    );
    const r = await refreshCatalog(dir, { providerId: "boring", runner: fakeRunner });
    expect(r.findings[0]?.status).toBe("nothing-found");
    expect(r.wrote).toBe(false);
  });
});
