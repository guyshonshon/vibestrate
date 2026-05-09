import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ArtifactStore } from "../src/core/artifact-store.js";

async function tempProjectRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-artifact-"));
}

describe("ArtifactStore", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProjectRoot();
  });

  it("creates run + artifacts dirs and writes/reads files", async () => {
    const store = new ArtifactStore(projectRoot, "20260509-100000-x");
    await store.init();
    const abs = await store.write("00-idea.md", "hello");
    expect(abs).toContain("artifacts");
    expect(abs).toContain("00-idea.md");
    const read = await store.read("00-idea.md");
    expect(read).toBe("hello");
  });

  it("supports nested loop paths", async () => {
    const store = new ArtifactStore(projectRoot, "r");
    await store.init();
    await store.write("loops/loop-1/fix-output.md", "fix");
    expect(await store.exists("loops/loop-1/fix-output.md")).toBe(true);
  });

  it("blocks path traversal", async () => {
    const store = new ArtifactStore(projectRoot, "r");
    await store.init();
    await expect(store.write("../escape.md", "x")).rejects.toThrow();
    await expect(store.write("loops/../../escape.md", "x")).rejects.toThrow();
    await expect(store.write("/abs/path.md", "x")).rejects.toThrow();
  });
});
