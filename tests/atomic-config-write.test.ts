import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { addOwnerPolicy } from "../src/project/project-policy-service.js";
import { writeTextAtomic } from "../src/utils/fs.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

async function tempProjectWithConfig(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-atomic-"));
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await applySetup({ options: { projectRoot: dir }, detectionRunner: claudeOk });
  return dir;
}

function configDir(projectRoot: string): string {
  return path.join(projectRoot, ".vibestrate");
}

async function leftoverTmpFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries.filter((n) => n.includes(".tmp."));
}

describe("writeTextAtomic", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProjectWithConfig();
  });

  it("writes the full contents (no truncation) and leaves no temp file", async () => {
    const target = path.join(configDir(projectRoot), "atomic-probe.txt");
    const body = "x".repeat(50_000);
    await writeTextAtomic(target, body);
    expect(await fs.readFile(target, "utf8")).toBe(body);
    expect(await leftoverTmpFiles(configDir(projectRoot))).toEqual([]);
  });

  it("creates the target directory if missing", async () => {
    const target = path.join(configDir(projectRoot), "nested", "deep", "file.txt");
    await writeTextAtomic(target, "hello");
    expect(await fs.readFile(target, "utf8")).toBe("hello");
  });

  it("setConfigValue persists a complete, valid config with no leftover .tmp", async () => {
    await setConfigValue(projectRoot, "git.mainBranch", "develop");

    const cfgPath = path.join(configDir(projectRoot), "project.yml");
    const text = await fs.readFile(cfgPath, "utf8");
    // Complete + parseable (a truncated write would fail to parse or lose keys).
    const parsed = YAML.parse(text) as {
      project?: { name?: string };
      git?: { mainBranch?: string };
      crews?: { default?: { roles?: Record<string, unknown> } };
    };
    expect(parsed.git?.mainBranch).toBe("develop");
    expect(parsed.project?.name).toBeDefined();
    expect(Object.keys(parsed.crews?.default?.roles ?? {})).toContain("planner");

    // The temp+rename path cleaned up after itself.
    expect(await leftoverTmpFiles(configDir(projectRoot))).toEqual([]);
  });

  it("policy append (through writeDocument) is atomic with no leftover .tmp", async () => {
    await addOwnerPolicy(
      projectRoot,
      { id: "no-eyebrow", statement: "no eyebrow labels" },
      new Date().toISOString(),
    );
    const cfgPath = path.join(configDir(projectRoot), "project.yml");
    const parsed = YAML.parse(await fs.readFile(cfgPath, "utf8")) as {
      projectPolicies?: Array<{ id: string }>;
    };
    expect(parsed.projectPolicies?.some((p) => p.id === "no-eyebrow")).toBe(true);
    expect(await leftoverTmpFiles(configDir(projectRoot))).toEqual([]);
  });
});
