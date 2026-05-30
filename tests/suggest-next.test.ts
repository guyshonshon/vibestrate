import { describe, it, expect } from "vitest";
import { suggestNext } from "../src/roadmap/suggest-next.js";
import type { Priority, Task, TaskStatus } from "../src/roadmap/roadmap-types.js";

let seq = 0;
function task(
  id: string,
  over: Partial<Task> & { status?: TaskStatus; priority?: Priority } = {},
): Task {
  // Deterministic increasing createdAt so "older first" is well-defined.
  const ts = `2026-01-01T00:00:${String(seq++).padStart(2, "0")}.000Z`;
  return {
    id,
    roadmapItemId: null,
    title: id,
    description: "",
    status: "backlog",
    priority: "medium",
    dependencies: [],
    createdAt: ts,
    updatedAt: ts,
    assignedRoles: [],
    requiredSkills: [],
    validationProfile: null,
    branchName: null,
    worktreePath: null,
    runIds: [],
    currentRunId: null,
    touchedFiles: [],
    riskLevel: "medium",
    commentsCount: 0,
    lastEventAt: null,
    effort: null,
    profileOverride: null,
    readOnly: false,
    checklist: [],
    needsTesting: false,
    needsTestingReason: null,
    derivedFrom: null,
    archived: false,
    ...over,
  };
}

describe("suggestNext", () => {
  it("returns [] for an empty or all-done backlog", () => {
    expect(suggestNext([])).toEqual([]);
    expect(
      suggestNext([task("a", { status: "done" }), task("b", { status: "cancelled" })]),
    ).toEqual([]);
  });

  it("only considers backlog + ready statuses (ignores in-flight/terminal)", () => {
    const out = suggestNext([
      task("backlog1", { status: "backlog" }),
      task("ready1", { status: "ready" }),
      task("running1", { status: "running" }),
      task("queued1", { status: "queued" }),
      task("done1", { status: "done" }),
    ]);
    expect(out.map((s) => s.taskId).sort()).toEqual(["backlog1", "ready1"]);
  });

  it("orders ready cards by priority (high → low)", () => {
    const out = suggestNext([
      task("low", { priority: "low" }),
      task("high", { priority: "high" }),
      task("med", { priority: "medium" }),
    ]);
    expect(out.map((s) => s.taskId)).toEqual(["high", "med", "low"]);
    expect(out[0]!.reason).toContain("ready");
  });

  it("ranks any ready card above any blocked card, regardless of priority", () => {
    const out = suggestNext([
      task("blockedHigh", { priority: "high", dependencies: ["openDep"] }),
      task("readyLow", { priority: "low" }),
      task("openDep", { status: "ready" }), // an open (not-done) blocker
    ]);
    // readyLow + openDep are ready; blockedHigh is not.
    const ids = out.map((s) => s.taskId);
    expect(ids.indexOf("blockedHigh")).toBe(ids.length - 1);
    expect(out.find((s) => s.taskId === "blockedHigh")!.ready).toBe(false);
  });

  it("a dependency that is done does NOT block", () => {
    const out = suggestNext([
      task("dependent", { dependencies: ["finished"] }),
      task("finished", { status: "done" }),
    ]);
    const dep = out.find((s) => s.taskId === "dependent")!;
    expect(dep.ready).toBe(true);
    expect(dep.openBlockers).toEqual([]);
  });

  it("an unknown/missing dependency counts as an open blocker (not ready)", () => {
    const out = suggestNext([task("x", { dependencies: ["ghost"] })]);
    expect(out[0]!.ready).toBe(false);
    expect(out[0]!.openBlockers).toEqual(["ghost"]);
    expect(out[0]!.reason).toContain("blocked by 1");
  });

  it("among blocked cards, priority dominates; blocker-count is the tiebreak", () => {
    // priority first: a high-priority 2-blocker card outranks a low-priority
    // 1-blocker card.
    const byPriority = suggestNext([
      task("twoBlockersHigh", { priority: "high", dependencies: ["g1", "g2"] }),
      task("oneBlockerLow", { priority: "low", dependencies: ["g1"] }),
    ]);
    expect(byPriority.map((s) => s.taskId)).toEqual([
      "twoBlockersHigh",
      "oneBlockerLow",
    ]);
    // equal priority → fewer open blockers ranks first.
    const byCount = suggestNext([
      task("twoBlockers", { priority: "medium", dependencies: ["g1", "g2"] }),
      task("oneBlocker", { priority: "medium", dependencies: ["g1"] }),
    ]);
    expect(byCount.map((s) => s.taskId)).toEqual(["oneBlocker", "twoBlockers"]);
  });

  it("breaks ties deterministically by createdAt then id", () => {
    seq = 0;
    const older = task("older", { priority: "medium" });
    const newer = task("newer", { priority: "medium" });
    const out = suggestNext([newer, older]);
    expect(out.map((s) => s.taskId)).toEqual(["older", "newer"]);
  });
});
