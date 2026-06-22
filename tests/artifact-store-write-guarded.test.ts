import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ArtifactStore } from "../src/core/artifact-store.js";

async function tempStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-aw-"));
  const store = new ArtifactStore(root, "brave-otter");
  await store.init();
  return { root, store };
}

describe("ArtifactStore.writeGuarded", () => {
  it("writes a regular file and reads it back (overwrites in place)", async () => {
    const { store } = await tempStore();
    await store.write("flows/spec/output.md", "old content that is longer");
    const abs = await store.writeGuarded("flows/spec/output.md", "new");
    expect(await store.read("flows/spec/output.md")).toBe("new");
    expect(abs.endsWith(path.join("flows", "spec", "output.md"))).toBe(true);
  });

  it("rejects an absolute path and a traversal path (resolveArtifactPath)", async () => {
    const { store } = await tempStore();
    await expect(store.writeGuarded("/etc/passwd", "x")).rejects.toThrow();
    await expect(store.writeGuarded("../../escape.md", "x")).rejects.toThrow();
    await expect(store.writeGuarded("flows/../../escape.md", "x")).rejects.toThrow();
  });

  it("refuses to follow a symlinked leaf and leaves the target untouched (O_NOFOLLOW)", async () => {
    const { root, store } = await tempStore();
    const dir = path.join(store.artifactsDir, "flows", "spec");
    await fs.mkdir(dir, { recursive: true });
    const outside = path.join(root, "outside.txt");
    await fs.writeFile(outside, "secret");
    await fs.symlink(outside, path.join(dir, "output.md"));
    await expect(store.writeGuarded("flows/spec/output.md", "pwned")).rejects.toThrow();
    expect(await fs.readFile(outside, "utf8")).toBe("secret");
  });

  it("refuses a hardlinked target and does NOT truncate it (nlink > 1 check before write)", async () => {
    const { root, store } = await tempStore();
    const dir = path.join(store.artifactsDir, "flows", "spec");
    await fs.mkdir(dir, { recursive: true });
    const outside = path.join(root, "outside-hard.txt");
    await fs.writeFile(outside, "secret-hardlink-target");
    await fs.link(outside, path.join(dir, "output.md")); // hardlink into the artifacts dir
    await expect(store.writeGuarded("flows/spec/output.md", "pwned")).rejects.toThrow();
    // The shared inode must be intact - not zeroed by a premature O_TRUNC.
    expect(await fs.readFile(outside, "utf8")).toBe("secret-hardlink-target");
  });
});
