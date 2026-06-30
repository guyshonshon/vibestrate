import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  getConfigValue,
  setConfigValue,
} from "../src/setup/config-update-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cfg-get-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("getConfigValue resolves schema defaults", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeProject();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns the schema default for a defaulted key not written on disk", async () => {
    // `git.snapshotRetentionRuns` is not scaffolded into project.yml; its schema
    // default is 0. Before this fix `config get` reported "Path not found".
    const onDisk = await fs.readFile(
      path.join(dir, ".vibestrate", "project.yml"),
      "utf8",
    );
    expect(onDisk).not.toContain("snapshotRetentionRuns"); // precondition: unset

    const r = await getConfigValue(dir, "git.snapshotRetentionRuns");
    expect(r.found).toBe(true);
    if (r.found) expect(r.value).toBe(0);
  });

  it("returns an explicitly set value verbatim (unchanged path)", async () => {
    await setConfigValue(dir, "git.snapshotRetentionRuns", "5");
    const r = await getConfigValue(dir, "git.snapshotRetentionRuns");
    expect(r.found).toBe(true);
    if (r.found) expect(r.value).toBe(5);
  });

  it("still reports a genuinely unknown key as not found", async () => {
    const r = await getConfigValue(dir, "git.totallyBogusKey");
    expect(r.found).toBe(false);
  });

  it("resolves config.supervised defaults for a config that never wrote a supervised section", async () => {
    // The saga conductor's per-task budget override layer. An existing project
    // (no `supervised:` in project.yml) must still resolve the defaults, so the launch
    // path can merge them: maxSteps 20, maxSpendUsd off.
    const onDisk = await fs.readFile(
      path.join(dir, ".vibestrate", "project.yml"),
      "utf8",
    );
    expect(onDisk).not.toContain("supervised:"); // precondition: unset

    const steps = await getConfigValue(dir, "supervised.maxSteps");
    expect(steps.found).toBe(true);
    if (steps.found) expect(steps.value).toBe(20);

    const spend = await getConfigValue(dir, "supervised.maxSpendUsd");
    expect(spend.found).toBe(true);
    if (spend.found) expect(spend.value).toBeNull();
  });

  it("reads an explicit config.supervised override verbatim (the override layer)", async () => {
    await setConfigValue(dir, "supervised.maxSteps", "5");
    const r = await getConfigValue(dir, "supervised.maxSteps");
    expect(r.found).toBe(true);
    if (r.found) expect(r.value).toBe(5);
  });
});
