import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  buildDependencyGraph,
  explainBlock,
  findFirstCycle,
  getOpenBlockers,
  isReady,
  listReadyTaskIds,
} from "../src/roadmap/dependency-graph.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import type { Task, TaskStatus } from "../src/roadmap/roadmap-types.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-dg-"));
}

function makeTask(id: string, deps: string[], status: TaskStatus = "ready"): Task {
  const ts = new Date().toISOString();
  return {
    id,
    roadmapItemId: null,
    title: id,
    description: "",
    status,
    priority: "medium",
    dependencies: deps,
    createdAt: ts,
    updatedAt: ts,
    assignedAgents: [],
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
    providerOverride: null,
    readOnly: false,
  };
}

describe("dependency graph helpers", () => {
  it("isReady is true when all blockers are done or cancelled", () => {
    const a = makeTask("a", [], "done");
    const b = makeTask("b", ["a"]);
    const g = buildDependencyGraph([a, b]);
    expect(isReady(g, "a")).toBe(true);
    expect(isReady(g, "b")).toBe(true);
  });

  it("isReady is false when a blocker is open", () => {
    const a = makeTask("a", [], "ready");
    const b = makeTask("b", ["a"]);
    const g = buildDependencyGraph([a, b]);
    expect(isReady(g, "b")).toBe(false);
    expect(getOpenBlockers(g, "b")).toEqual(["a"]);
  });

  it("isReady is false when a blocker is missing", () => {
    const b = makeTask("b", ["ghost"]);
    const g = buildDependencyGraph([b]);
    expect(isReady(g, "b")).toBe(false);
    const r = explainBlock(g, "b");
    expect(r.blockedByMissing).toEqual(["ghost"]);
  });

  it("listReadyTaskIds returns only the ready ones", () => {
    const a = makeTask("a", [], "done");
    const b = makeTask("b", ["a"], "ready");
    const c = makeTask("c", ["b"], "ready");
    const g = buildDependencyGraph([a, b, c]);
    expect(listReadyTaskIds(g)).toEqual(["a", "b"]);
  });

  it("findFirstCycle detects a 2-node cycle", () => {
    const a = makeTask("a", ["b"]);
    const b = makeTask("b", ["a"]);
    const g = buildDependencyGraph([a, b]);
    const r = findFirstCycle(g);
    expect(r.cyclic).toBe(true);
    expect(r.cycle.length).toBeGreaterThan(0);
  });

  it("findFirstCycle reports none for an acyclic graph", () => {
    const a = makeTask("a", []);
    const b = makeTask("b", ["a"]);
    const c = makeTask("c", ["b"]);
    const g = buildDependencyGraph([a, b, c]);
    expect(findFirstCycle(g).cyclic).toBe(false);
  });
});

describe("dependency graph + RoadmapService", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("buildDependencyGraph reads back the same tasks/edges", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A" });
    const b = await svc.addTask({ title: "B", dependencies: [a.id] });
    const g = buildDependencyGraph([a, b]);
    expect([...g.blockers.get(b.id) ?? []]).toEqual([a.id]);
    expect([...g.dependents.get(a.id) ?? []]).toEqual([b.id]);
  });
});
