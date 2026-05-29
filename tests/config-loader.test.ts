import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import { loadConfig } from "../src/project/config-loader.js";
import { ConfigError } from "../src/utils/errors.js";

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-config-"));
  await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
  return dir;
}

const validConfig = {
  project: { name: "demo", type: "generic" },
  providers: {
    claude: { type: "cli", command: "claude", args: ["-p"], input: "stdin" },
  },
  profiles: {
    "claude-balanced": { provider: "claude" },
  },
  crews: {
    default: {
      roles: {
        planner: { seats: ["planner"], profile: "claude-balanced", prompt: ".vibestrate/roles/planner.md", permissions: "read_only" },
        architect: { seats: ["architect"], profile: "claude-balanced", prompt: ".vibestrate/roles/architect.md", permissions: "read_only" },
        executor: { seats: ["implementer"], profile: "claude-balanced", prompt: ".vibestrate/roles/executor.md", permissions: "code_write" },
        fixer: { seats: ["fixer"], profile: "claude-balanced", prompt: ".vibestrate/roles/fixer.md", permissions: "code_write" },
        reviewer: { seats: ["reviewer"], profile: "claude-balanced", prompt: ".vibestrate/roles/reviewer.md", permissions: "read_only" },
        verifier: { seats: ["verifier"], profile: "claude-balanced", prompt: ".vibestrate/roles/verifier.md", permissions: "read_only" },
      },
    },
  },
  defaultCrew: "default",
};

describe("config loader", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("loads a valid config", async () => {
    await fs.writeFile(
      path.join(projectRoot, ".vibestrate", "project.yml"),
      YAML.stringify(validConfig),
      "utf8",
    );
    const loaded = await loadConfig(projectRoot);
    expect(loaded.config.project.name).toBe("demo");
    expect(loaded.config.workflow.maxReviewLoops).toBe(2);
    expect(loaded.config.git.branchPrefix).toBe("vibestrate/");
  });

  it("fails when config is missing", async () => {
    await expect(loadConfig(projectRoot)).rejects.toBeInstanceOf(ConfigError);
  });

  it("fails when config is invalid", async () => {
    await fs.writeFile(
      path.join(projectRoot, ".vibestrate", "project.yml"),
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
      path.join(projectRoot, ".vibestrate", "project.yml"),
      YAML.stringify(broken),
      "utf8",
    );
    await expect(loadConfig(projectRoot)).rejects.toBeInstanceOf(ConfigError);
  });

  it("uses default rules when rules.md is missing", async () => {
    await fs.writeFile(
      path.join(projectRoot, ".vibestrate", "project.yml"),
      YAML.stringify(validConfig),
      "utf8",
    );
    const loaded = await loadConfig(projectRoot);
    expect(loaded.rules).toContain("Project Instructions");
  });
});
