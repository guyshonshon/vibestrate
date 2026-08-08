import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RoadmapCorruptError } from "../src/roadmap/roadmap-store.js";

/**
 * A corrupt roadmap.json used to be read as "no items", which the next write
 * then persisted - one hand-edit typo silently replaced every item with the one
 * being added. The contract now: read paths report the corruption honestly, and
 * write paths move the file aside intact before starting fresh, so the owner
 * can always get their items back.
 */
describe("roadmap.json corruption", () => {
  let root: string;
  let roadmapPath: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-corrupt-"));
    roadmapPath = path.join(root, ".vibestrate", "roadmap", "roadmap.json");
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    warn.mockRestore();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function seedCorrupt(): Promise<void> {
    const svc = new RoadmapService(root);
    await svc.init();
    await svc.addRoadmapItem({ title: "keep me" });
    await fs.writeFile(roadmapPath, "{ this is not json", "utf8");
  }

  const corruptSiblings = async (): Promise<string[]> => {
    const dir = path.dirname(roadmapPath);
    return (await fs.readdir(dir)).filter((f) => f.includes(".corrupt-"));
  };

  it("read paths report the corruption instead of an empty roadmap", async () => {
    await seedCorrupt();
    const svc = new RoadmapService(root);
    await expect(svc.listRoadmapItems()).rejects.toBeInstanceOf(RoadmapCorruptError);
  });

  // Each of the three write paths reaches the store through a different route;
  // update/archive pre-read the item, which is how they previously bypassed the
  // quarantine and stayed dead until the file was repaired by hand.
  it("add makes progress and preserves the unreadable file", async () => {
    await seedCorrupt();
    const svc = new RoadmapService(root);
    await svc.addRoadmapItem({ title: "new one" });
    expect(await corruptSiblings()).toHaveLength(1);
    const items = await svc.listRoadmapItems();
    expect(items.map((i) => i.title)).toEqual(["new one"]);
  });

  it("update does not throw on a corrupt file", async () => {
    await seedCorrupt();
    const svc = new RoadmapService(root);
    // The item is gone from the live file once quarantined, so "not found" is
    // the honest answer - but it must be that, not a raw parse error.
    await expect(
      svc.updateRoadmapItem("rm-does-not-exist", { title: "x" }),
    ).rejects.not.toBeInstanceOf(RoadmapCorruptError);
    expect(await corruptSiblings()).toHaveLength(1);
  });

  it("archive does not throw on a corrupt file", async () => {
    await seedCorrupt();
    const svc = new RoadmapService(root);
    await expect(svc.archiveRoadmapItem("rm-does-not-exist")).rejects.not.toBeInstanceOf(
      RoadmapCorruptError,
    );
    expect(await corruptSiblings()).toHaveLength(1);
  });

  it("concurrent writers do not race the quarantine into ENOENT", async () => {
    await seedCorrupt();
    const svc = new RoadmapService(root);
    const results = await Promise.allSettled([
      svc.addRoadmapItem({ title: "a" }),
      svc.addRoadmapItem({ title: "b" }),
      svc.addRoadmapItem({ title: "c" }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    // Serialized, so no add is lost to a read-modify-write overlap either.
    const titles = (await svc.listRoadmapItems()).map((i) => i.title).sort();
    expect(titles).toEqual(["a", "b", "c"]);
  });

  it("a healthy roadmap is untouched", async () => {
    const svc = new RoadmapService(root);
    await svc.init();
    await svc.addRoadmapItem({ title: "one" });
    await svc.addRoadmapItem({ title: "two" });
    expect((await svc.listRoadmapItems()).map((i) => i.title)).toEqual(["one", "two"]);
    expect(await corruptSiblings()).toHaveLength(0);
  });
});
