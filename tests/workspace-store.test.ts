import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { WorkspaceStore } from "../src/workspace/workspace-store.js";

async function freshStore(): Promise<{ store: WorkspaceStore; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ws-"));
  const file = path.join(dir, "workspace.json");
  return { store: new WorkspaceStore(file), file };
}

describe("WorkspaceStore", () => {
  it("starts empty and lists nothing", async () => {
    const { store } = await freshStore();
    expect(await store.list()).toEqual([]);
  });

  it("registers a project (label defaults to the basename)", async () => {
    const { store } = await freshStore();
    const entry = await store.register({ root: "/tmp/some/my-proj", port: 4317 });
    expect(entry.label).toBe("my-proj");
    expect(entry.lastPort).toBe(4317);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.root).toBe(path.resolve("/tmp/some/my-proj"));
  });

  it("dedups by root, refreshing lastOpenedAt + port but keeping addedAt", async () => {
    const { store } = await freshStore();
    const a = await store.register({ root: "/tmp/p" });
    const b = await store.register({ root: "/tmp/p", port: 5000 });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(b.addedAt).toBe(a.addedAt);
    expect(list[0]!.lastPort).toBe(5000);
    expect(b.lastOpenedAt >= a.lastOpenedAt).toBe(true);
  });

  it("honors an explicit label", async () => {
    const { store } = await freshStore();
    const e = await store.register({ root: "/tmp/x", label: "Backend" });
    expect(e.label).toBe("Backend");
  });

  it("removes a project (returns false for an unknown one)", async () => {
    const { store } = await freshStore();
    await store.register({ root: "/tmp/gone" });
    expect(await store.remove("/tmp/gone")).toBe(true);
    expect(await store.list()).toHaveLength(0);
    expect(await store.remove("/tmp/never")).toBe(false);
  });

  it("lists most-recently-opened first", async () => {
    const { store } = await freshStore();
    await store.register({ root: "/tmp/old" });
    await new Promise((r) => setTimeout(r, 5));
    await store.register({ root: "/tmp/new" });
    const list = await store.list();
    expect(list[0]!.root).toBe(path.resolve("/tmp/new"));
  });

  it("tolerates a corrupt registry file (returns empty, then repairs)", async () => {
    const { store, file } = await freshStore();
    await fs.writeFile(file, "{ not json");
    expect(await store.list()).toEqual([]);
    await store.register({ root: "/tmp/ok" });
    expect(await store.list()).toHaveLength(1);
  });
});
