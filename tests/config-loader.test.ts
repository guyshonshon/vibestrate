import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import { loadConfig } from "../src/project/config-loader.js";
import { ConfigError } from "../src/utils/errors.js";

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-config-"));
  await fs.mkdir(path.join(dir, ".amaco"), { recursive: true });
  return dir;
}

const validConfig = {
  project: { name: "demo", type: "generic" },
  providers: {
    claude: { type: "cli", command: "claude", args: ["-p"], input: "stdin" },
  },
  roles: {
    planner: { provider: "claude", prompt: ".amaco/roles/planner.md", permissions: "read_only" },
    architect: {
      provider: "claude",
      prompt: ".amaco/roles/architect.md",
      permissions: "read_only",
    },
    executor: {
      provider: "claude",
      prompt: ".amaco/roles/executor.md",
      permissions: "code_write",
    },
    fixer: { provider: "claude", prompt: ".amaco/roles/fixer.md", permissions: "code_write" },
    reviewer: { provider: "claude", prompt: ".amaco/roles/reviewer.md", permissions: "read_only" },
    verifier: { provider: "claude", prompt: ".amaco/roles/verifier.md", permissions: "read_only" },
  },
};

describe("config loader", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("loads a valid config", async () => {
    await fs.writeFile(
      path.join(projectRoot, ".amaco", "project.yml"),
      YAML.stringify(validConfig),
      "utf8",
    );
    const loaded = await loadConfig(projectRoot);
    expect(loaded.config.project.name).toBe("demo");
    expect(loaded.config.workflow.maxReviewLoops).toBe(2);
    expect(loaded.config.git.branchPrefix).toBe("amaco/");
  });

  it("fails when config is missing", async () => {
    await expect(loadConfig(projectRoot)).rejects.toBeInstanceOf(ConfigError);
  });

  it("fails when config is invalid", async () => {
    await fs.writeFile(
      path.join(projectRoot, ".amaco", "project.yml"),
      YAML.stringify({ project: {} }),
      "utf8",
    );
    await expect(loadConfig(projectRoot)).rejects.toBeInstanceOf(ConfigError);
  });

  it("fails when provider config has invalid type", async () => {
    const broken = {
      ...validConfig,
      providers: { claude: { type: "api", command: "claude" } },
    };
    await fs.writeFile(
      path.join(projectRoot, ".amaco", "project.yml"),
      YAML.stringify(broken),
      "utf8",
    );
    await expect(loadConfig(projectRoot)).rejects.toBeInstanceOf(ConfigError);
  });

  it("uses default rules when rules.md is missing", async () => {
    await fs.writeFile(
      path.join(projectRoot, ".amaco", "project.yml"),
      YAML.stringify(validConfig),
      "utf8",
    );
    const loaded = await loadConfig(projectRoot);
    expect(loaded.rules).toContain("Project Rules");
  });
});
