import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applySetup } from "../src/setup/setup-service.js";
import {
  addProvider,
  setDefaultProvider,
  listConfiguredProviders,
} from "../src/setup/provider-setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pset-"));
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

describe("provider set / list", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("listConfiguredProviders shows the default claude entry and used-by agents", async () => {
    const list = await listConfiguredProviders(projectRoot);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("claude");
    expect(list[0]!.rolesUsing).toEqual(
      expect.arrayContaining([
        "planner",
        "architect",
        "executor",
        "fixer",
        "reviewer",
        "verifier",
      ]),
    );
  });

  it("addProvider appends a new provider and (optionally) reassigns agents", async () => {
    await addProvider(projectRoot, {
      id: "myagent",
      config: { type: "cli", command: "myagent", args: ["--prompt"], input: "arg" },
      alsoAssignAllRoles: true,
    });
    const list = await listConfiguredProviders(projectRoot);
    const myagent = list.find((p) => p.id === "myagent")!;
    expect(myagent.command).toBe("myagent");
    expect(myagent.rolesUsing.length).toBeGreaterThan(0);
  });

  it("setDefaultProvider fails clearly when provider is not configured", async () => {
    const r = await setDefaultProvider(projectRoot, "ghost");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('"ghost"');
      expect(r.hint).toContain("vibestrate provider setup");
    }
  });

  it("addProvider rejects invalid ids", async () => {
    await expect(
      addProvider(projectRoot, {
        id: "1bad",
        config: { type: "cli", command: "x", args: [], input: "stdin" },
        alsoAssignAllRoles: false,
      }),
    ).rejects.toThrow();
  });
});
