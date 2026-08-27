import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import {
  coarseColumnOf,
  stageColumnOf,
  validStageTargets,
  validDropTargets,
  UNSTAGED,
} from "../src/ui/components/board/dnd.js";
import type { Task } from "../src/ui/lib/types.js";

/**
 * The board has two axes, and they are not the same one.
 *
 * `status` is execution state: the machine owns it and it moves because a run
 * started, failed or reached merge_ready. `stage` is where a person filed the
 * card. Conflating them is what made the old board's lanes feel like they
 * diverged from reality - every honest drag was either a lie or an execution.
 */
const card = (over: Partial<Task> = {}): Task =>
  ({
    id: "t1",
    title: "t",
    status: "backlog",
    archived: false,
    needsTesting: false,
    stage: null,
    ...over,
  }) as Task;

describe("the two axes stay separate", () => {
  it("a stage does not move the derived column", () => {
    const filed = card({ stage: "Needs planning" });
    // Same run status, so the same derived column - filing is not execution.
    expect(coarseColumnOf(filed)).toBe(coarseColumnOf(card()));
  });

  it("a run status does not move the stage column", () => {
    const stages = ["Needs planning", "In design"];
    const running = card({ stage: "In design", status: "running" });
    const done = card({ stage: "In design", status: "done" });
    expect(stageColumnOf(running, stages)).toBe("In design");
    expect(stageColumnOf(done, stages)).toBe("In design");
  });

  it("an unfiled card is unstaged, not hidden", () => {
    expect(stageColumnOf(card(), ["A"])).toBe(UNSTAGED);
  });

  it("a card filed under a stage the board no longer lists still appears", () => {
    // Renaming or deleting a stage must not make cards vanish - that is data
    // loss the user cannot see, which is the worst kind.
    expect(stageColumnOf(card({ stage: "Retired lane" }), ["A", "B"])).toBe(UNSTAGED);
  });
});

describe("drag targets", () => {
  it("every stage column is a real target, because re-filing runs nothing", () => {
    const targets = validStageTargets(["A", "B"]);
    expect(targets.has("A")).toBe(true);
    expect(targets.has("B")).toBe(true);
    expect(targets.has(UNSTAGED)).toBe(true);
  });

  it("the derived board stays as restricted as it was", () => {
    // On the status axis a drag still cannot start or un-fail anything; the
    // only honest move is archiving a non-live card.
    expect([...validDropTargets(card())]).toEqual(["archived"]);
    expect([...validDropTargets(card({ status: "done" }))]).toEqual([]);
  });
});

describe("filing a card", () => {
  it("sets and clears the stage without touching status", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-stage-"));
    const svc = new RoadmapService(dir);
    const created = await svc.addTask({ title: "Ship the thing" });
    expect(created.stage).toBeNull();

    const filed = await svc.setTaskStage(created.id, "Needs planning");
    expect(filed?.stage).toBe("Needs planning");
    // The whole point: filing is inert.
    expect(filed?.status).toBe(created.status);

    const cleared = await svc.setTaskStage(created.id, null);
    expect(cleared?.stage).toBeNull();
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("treats blank as unstaged rather than storing an empty label", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-stage2-"));
    const svc = new RoadmapService(dir);
    const t = await svc.addTask({ title: "x" });
    expect((await svc.setTaskStage(t.id, "   "))?.stage).toBeNull();
    // ...and trims, so "In design " and "In design" are one column.
    expect((await svc.setTaskStage(t.id, " In design "))?.stage).toBe("In design");
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("accepts a stage the board does not list, rather than orphaning the card", async () => {
    // Validating against `board.stages` would mean a renamed stage refuses
    // every card still filed under the old name.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-stage3-"));
    const svc = new RoadmapService(dir);
    const t = await svc.addTask({ title: "x" });
    expect((await svc.setTaskStage(t.id, "Not In Any Config"))?.stage).toBe("Not In Any Config");
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);

  it("reports a missing task instead of inventing one", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-stage4-"));
    const svc = new RoadmapService(dir);
    expect(await svc.setTaskStage("no-such-task", "A")).toBeNull();
    await fs.rm(dir, { recursive: true, force: true });
  }, 60_000);
});
