import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  applySetup,
  planSetup,
} from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-setup-"));
}

describe("setup service", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("planSetup combines project + provider detections", async () => {
    await fs.writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest", typecheck: "tsc" } }),
    );
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "");
    const plan = await planSetup({ projectRoot, detectionRunner: claudeOk });
    expect(plan.project.packageManager).toBe("pnpm");
    expect(plan.recommendedProvider?.id).toBe("claude");
    expect(plan.providerComplete).toBe(true);
    expect(plan.validationCommands).toEqual(["pnpm typecheck", "pnpm test"]);
  });

  it("applySetup writes a complete config when claude is detected", async () => {
    await fs.writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
    );
    await fs.writeFile(path.join(projectRoot, "pnpm-lock.yaml"), "");
    const r = await applySetup({
      options: { projectRoot },
      detectionRunner: claudeOk,
    });
    expect(r.init.configWritten).toBe(true);
    expect(r.plan.recommendedProvider?.id).toBe("claude");
  });

  it("applySetup still writes scaffold when no provider is detected", async () => {
    const r = await applySetup({
      options: { projectRoot },
      detectionRunner: noProvider,
    });
    expect(r.init.configWritten).toBe(true);
    expect(r.plan.recommendedProvider).toBeNull();
    expect(r.plan.providerComplete).toBe(false);
  });
});
