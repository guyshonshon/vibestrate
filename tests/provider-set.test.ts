import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applySetup } from "../src/setup/setup-service.js";
import {
  addProvider,
  setDefaultProvider,
  removeProvider,
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
      expect(r.hint).toContain("vibe provider setup");
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

  it("removeProvider refuses while a role still uses it, then succeeds once unused", async () => {
    // Add an unused provider — it removes cleanly.
    await addProvider(projectRoot, {
      id: "spare",
      config: { type: "cli", command: "spare", args: [], input: "stdin" },
      alsoAssignAllRoles: false,
    });
    const removedSpare = await removeProvider(projectRoot, "spare");
    expect(removedSpare.ok).toBe(true);
    expect(
      (await listConfiguredProviders(projectRoot)).some((p) => p.id === "spare"),
    ).toBe(false);

    // The default claude provider is used by every role → refused with reason.
    const refused = await removeProvider(projectRoot, "claude");
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toContain("still used by");
      expect(refused.hint).toContain("another provider");
    }
    // Still present after the refusal.
    expect(
      (await listConfiguredProviders(projectRoot)).some((p) => p.id === "claude"),
    ).toBe(true);
  });

  it("removeProvider reports a clear miss for an unknown provider", async () => {
    const r = await removeProvider(projectRoot, "ghost");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('"ghost"');
  });
});
