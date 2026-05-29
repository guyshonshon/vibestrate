import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { projectConfigSchema } from "../src/project/config-schema.js";
import { applySetup } from "../src/setup/setup-service.js";
import {
  setConfigValue,
  getConfigValue,
} from "../src/setup/config-update-service.js";
import { ConfigError } from "../src/utils/errors.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function tempProjectWithConfig(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policy-"));
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("policies.requireApprovalAtStages — schema", () => {
  it("defaults to empty array when policies block is omitted entirely", () => {
    const r = projectConfigSchema.safeParse({
      project: { name: "x" },
      providers: { claude: { type: "cli", command: "claude" } },
      profiles: { "claude-balanced": { provider: "claude" } },
      crews: {
        default: {
          roles: {
            planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            architect: { seats: ["architect"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            verifier: { seats: ["verifier"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          },
        },
      },
      defaultCrew: "default",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.policies.requireApprovalAtStages).toEqual([]);
    }
  });

  it("accepts every canonical stage name", () => {
    const stages = [
      "planning",
      "architecting",
      "executing",
      "validating",
      "reviewing",
      "fixing",
      "verifying",
    ] as const;
    const r = projectConfigSchema.safeParse({
      project: { name: "x" },
      providers: { claude: { type: "cli", command: "claude" } },
      profiles: { "claude-balanced": { provider: "claude" } },
      crews: {
        default: {
          roles: {
            planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            architect: { seats: ["architect"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            verifier: { seats: ["verifier"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          },
        },
      },
      defaultCrew: "default",
      policies: { requireApprovalAtStages: stages },
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown stage names", () => {
    const r = projectConfigSchema.safeParse({
      project: { name: "x" },
      providers: { claude: { type: "cli", command: "claude" } },
      profiles: { "claude-balanced": { provider: "claude" } },
      crews: {
        default: {
          roles: {
            planner: { seats: ["planner"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            architect: { seats: ["architect"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            executor: { seats: ["implementer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: "p", permissions: "code_write" },
            reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
            verifier: { seats: ["verifier"], profile: "claude-balanced", prompt: "p", permissions: "read_only" },
          },
        },
      },
      defaultCrew: "default",
      policies: { requireApprovalAtStages: ["architecting", "merging"] },
    });
    expect(r.success).toBe(false);
  });
});

describe("policies.requireApprovalAtStages — config get/set", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProjectWithConfig();
  });

  it("default value reads as empty array", async () => {
    const r = await getConfigValue(
      projectRoot,
      "policies.requireApprovalAtStages",
    );
    expect(r.found && r.value).toEqual([]);
  });

  it("set accepts a valid JSON array of canonical stages", async () => {
    await setConfigValue(
      projectRoot,
      "policies.requireApprovalAtStages",
      JSON.stringify(["architecting", "verifying"]),
    );
    const r = await getConfigValue(
      projectRoot,
      "policies.requireApprovalAtStages",
    );
    expect(r.found && r.value).toEqual(["architecting", "verifying"]);
  });

  it("set refuses an unknown stage", async () => {
    await expect(
      setConfigValue(
        projectRoot,
        "policies.requireApprovalAtStages",
        JSON.stringify(["merging"]),
      ),
    ).rejects.toBeInstanceOf(ConfigError);
    // Original value preserved.
    const r = await getConfigValue(
      projectRoot,
      "policies.requireApprovalAtStages",
    );
    expect(r.found && r.value).toEqual([]);
  });

  it("set refuses a string when an array is required", async () => {
    await expect(
      setConfigValue(
        projectRoot,
        "policies.requireApprovalAtStages",
        "architecting",
      ),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
