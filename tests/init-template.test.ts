import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import YAML from "yaml";
import { runInit } from "../src/project/init-template.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-init-"));
}

const claudeOk: ProviderDetectionRunner = async (cmd) => {
  if (cmd === "claude") return { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" };
  return { exitCode: 127, stdout: "", stderr: "" };
};

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "not found",
});

async function readGeneratedConfig(projectRoot: string): Promise<Record<string, unknown>> {
  const text = await fs.readFile(
    path.join(projectRoot, ".vibestrate", "project.yml"),
    "utf8",
  );
  return YAML.parse(text);
}

describe("init template", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("generates runnable Claude config when Claude is detected", async () => {
    await fs.writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "x", scripts: { typecheck: "tsc", test: "vitest" } }),
    );
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "");

    const r = await applySetup({
      options: { projectRoot },
      detectionRunner: claudeOk,
    });
    expect(r.plan.recommendedProvider?.id).toBe("claude");

    const cfg = (await readGeneratedConfig(projectRoot)) as {
      providers: Record<string, { command: string; args: string[]; input: string }>;
      profiles: Record<string, { provider: string }>;
      crews: Record<string, { roles: Record<string, { profile: string; fills: string[] }> }>;
      defaultCrew: string;
      commands: { validate: string[] };
    };
    expect(cfg.providers["claude"]?.command).toBe("claude");
    expect(cfg.providers["claude"]?.args).toEqual(["-p"]);
    expect(cfg.providers["claude"]?.input).toBe("stdin");
    // A profile is created on the recommended provider, and every default-crew
    // role runs on it.
    expect(cfg.profiles["claude-balanced"]?.provider).toBe("claude");
    expect(cfg.defaultCrew).toBe("default");
    const roles = cfg.crews["default"]!.roles;
    for (const roleId of ["planner", "architect", "executor", "fixer", "reviewer", "verifier"]) {
      expect(roles[roleId]?.profile).toBe("claude-balanced");
      expect(cfg.profiles[roles[roleId]!.profile]?.provider).toBe("claude");
    }
    // The implementer seat is fillable by the executor role.
    expect(roles["executor"]?.fills).toContain("implementer");
    expect(cfg.commands.validate).toEqual(["pnpm typecheck", "pnpm test"]);
  });

  it("initializes safely when no provider is detected (placeholder claude provider, empty validation)", async () => {
    const r = await applySetup({
      options: { projectRoot },
      detectionRunner: noProvider,
    });
    expect(r.plan.recommendedProvider).toBeNull();
    expect(r.plan.providerComplete).toBe(false);

    const cfg = (await readGeneratedConfig(projectRoot)) as {
      providers: Record<string, unknown>;
      commands: { validate: string[] };
    };
    expect(cfg.providers).toHaveProperty("claude");
    expect(cfg.commands.validate).toEqual([]);
  });

  it("does not overwrite existing config without force", async () => {
    await applySetup({ options: { projectRoot }, detectionRunner: claudeOk });
    const second = await runInit({ projectRoot });
    expect(second.created.find((p) => p.endsWith("project.yml"))).toBeUndefined();
    expect(second.skipped.find((p) => p.endsWith("project.yml"))).toBeDefined();
  });

  it("preserves runs across re-init", async () => {
    await applySetup({ options: { projectRoot }, detectionRunner: claudeOk });
    const runDir = path.join(projectRoot, ".vibestrate", "runs", "20260509-x");
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, "marker.txt"), "preserve me");

    await applySetup({
      options: { projectRoot, force: true },
      detectionRunner: claudeOk,
    });
    const marker = await fs.readFile(path.join(runDir, "marker.txt"), "utf8");
    expect(marker).toBe("preserve me");
  });
});
