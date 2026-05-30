import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  coarseColumn,
  COARSE_COLUMNS,
  type TaskStatus,
} from "../src/roadmap/roadmap-types.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

describe("coarseColumn", () => {
  it("maps each run status to a coarse column", () => {
    const cases: [TaskStatus, string][] = [
      ["backlog", "planned"],
      ["ready", "planned"],
      ["queued", "in_progress"],
      ["running", "in_progress"],
      ["waiting_for_approval", "in_progress"],
      ["review", "in_progress"],
      ["blocked", "in_progress"],
      ["failed", "in_progress"],
      ["done", "completed"],
      ["cancelled", "archived"],
    ];
    for (const [status, col] of cases) {
      expect(coarseColumn({ status })).toBe(col);
    }
  });

  it("needs-testing overlay wins over status (even when done)", () => {
    expect(coarseColumn({ status: "done", needsTesting: true })).toBe(
      "needs_testing",
    );
    expect(coarseColumn({ status: "running", needsTesting: true })).toBe(
      "needs_testing",
    );
  });

  it("archived overlay wins over everything (incl. needs-testing)", () => {
    expect(coarseColumn({ status: "running", archived: true })).toBe("archived");
    expect(coarseColumn({ status: "done", archived: true })).toBe("archived");
    expect(
      coarseColumn({ status: "done", needsTesting: true, archived: true }),
    ).toBe("archived");
  });

  it("exposes exactly the five coarse columns in order", () => {
    expect(COARSE_COLUMNS.map((c) => c.id)).toEqual([
      "planned",
      "in_progress",
      "needs_testing",
      "completed",
      "archived",
    ]);
  });
});

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-arch-"));
}

describe("RoadmapService — archive", () => {
  let svc: RoadmapService;
  beforeEach(async () => {
    svc = new RoadmapService(await tempProject());
    await svc.init();
  });

  it("archives and un-archives, landing in the right coarse column", async () => {
    const t = await svc.addTask({ title: "x" });
    expect(coarseColumn(t)).toBe("planned");
    const archived = await svc.setArchived(t.id, true);
    expect(archived.archived).toBe(true);
    expect(coarseColumn(archived)).toBe("archived");
    const back = await svc.setArchived(t.id, false);
    expect(back.archived).toBe(false);
    expect(coarseColumn(back)).toBe("planned");
  });

  it("refuses to archive a task linked to an active run", async () => {
    const t = await svc.addTask({ title: "x" });
    await svc.setTaskRun({ taskId: t.id, runId: "run-1", status: "running" });
    await expect(svc.setArchived(t.id, true)).rejects.toThrow(/active run/);
  });
});
