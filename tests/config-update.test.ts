import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import {
  coerceValueString,
  getConfigValue,
  setConfigValue,
  validateConfigFile,
  showConfig,
} from "../src/setup/config-update-service.js";
import { ConfigError } from "../src/utils/errors.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

async function tempProjectWithConfig(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-cfg-"));
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await applySetup({ options: { projectRoot: dir }, detectionRunner: claudeOk });
  return dir;
}

describe("coerceValueString", () => {
  it("parses booleans", () => {
    expect(coerceValueString("true")).toBe(true);
    expect(coerceValueString("false")).toBe(false);
  });
  it("parses integers and floats", () => {
    expect(coerceValueString("3")).toBe(3);
    expect(coerceValueString("3.14")).toBe(3.14);
    expect(coerceValueString("-2")).toBe(-2);
  });
  it("parses JSON arrays", () => {
    expect(coerceValueString('["a","b"]')).toEqual(["a", "b"]);
  });
  it("parses JSON objects", () => {
    expect(coerceValueString('{"a":1}')).toEqual({ a: 1 });
  });
  it("treats bare strings as strings", () => {
    expect(coerceValueString("main")).toBe("main");
    expect(coerceValueString("amaco/")).toBe("amaco/");
  });
  it("throws on malformed JSON for json-prefixed input", () => {
    expect(() => coerceValueString("[bad")).toThrow(ConfigError);
  });
});

describe("config get/set/validate", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProjectWithConfig();
  });

  it("get returns parsed value", async () => {
    const result = await getConfigValue(projectRoot, "workflow.maxReviewLoops");
    expect(result.found).toBe(true);
    if (result.found) expect(result.value).toBe(2);
  });

  it("get returns not-found for missing path", async () => {
    const result = await getConfigValue(projectRoot, "nope.notthere");
    expect(result.found).toBe(false);
  });

  it("set writes a number value and revalidates", async () => {
    const r = await setConfigValue(projectRoot, "workflow.maxReviewLoops", "4");
    expect(r.newValue).toBe(4);
    const after = await getConfigValue(projectRoot, "workflow.maxReviewLoops");
    expect(after.found && after.value).toBe(4);
  });

  it("set writes a JSON array value", async () => {
    await setConfigValue(
      projectRoot,
      "commands.validate",
      JSON.stringify(["pnpm test", "pnpm typecheck"]),
    );
    const after = await getConfigValue(projectRoot, "commands.validate");
    expect(after.found && after.value).toEqual(["pnpm test", "pnpm typecheck"]);
  });

  it("set refuses to write invalid config", async () => {
    await expect(
      setConfigValue(projectRoot, "workflow.maxReviewLoops", "-1"),
    ).rejects.toBeInstanceOf(ConfigError);

    // Original value preserved.
    const orig = await getConfigValue(projectRoot, "workflow.maxReviewLoops");
    expect(orig.found && orig.value).toBe(2);
  });

  it("validate reports ok for fresh config", async () => {
    const r = await validateConfigFile(projectRoot);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("validate reports issues when YAML is corrupted", async () => {
    const cfgPath = path.join(projectRoot, ".amaco", "project.yml");
    await fs.writeFile(cfgPath, "::: not yaml :::");
    const r = await validateConfigFile(projectRoot);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("show returns text and parsed config", async () => {
    const r = await showConfig(projectRoot);
    expect(r.text).toContain("project:");
    expect(r.parsed?.project.name).toBeDefined();
    expect(r.error).toBeNull();
  });

  it("does not corrupt YAML when setting a deep value", async () => {
    await setConfigValue(projectRoot, "git.mainBranch", "develop");
    const after = await getConfigValue(projectRoot, "git.mainBranch");
    expect(after.found && after.value).toBe("develop");

    // Round-trip: parse again, ensure structure intact.
    const text = await fs.readFile(
      path.join(projectRoot, ".amaco", "project.yml"),
      "utf8",
    );
    const reparsed = YAML.parse(text) as { roles: Record<string, unknown> };
    expect(Object.keys(reparsed.roles)).toEqual(
      expect.arrayContaining(["planner", "architect", "executor", "fixer", "reviewer", "verifier"]),
    );
  });
});
