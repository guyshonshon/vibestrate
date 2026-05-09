import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ProposalService } from "../src/roadmap/proposal-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

const happy = `AMACO_ROADMAP_ITEM:
TITLE: Build onboarding
PRIORITY: high

AMACO_TASK:
TITLE: Create setup wizard
ROADMAP: Build onboarding
RISK: medium
LIKELY_FILES: src/cli/commands/setup.ts

AMACO_TASK:
TITLE: Add setup tests
ROADMAP: Build onboarding
DEPENDS_ON: Create setup wizard
RISK: low
LIKELY_FILES: tests/setup-service.test.ts
`;

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-prop-"));
}

describe("ProposalService — dryRun", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
    const ps = new ProposalService(projectRoot);
    await ps.init();
    await ps.writeProposalText("demo", happy);
  });

  it("preview returns roadmap+tasks+edges, writes nothing", async () => {
    const ps = new ProposalService(projectRoot);
    const r = await ps.dryRun({ proposalId: "demo" });
    expect(r.willCreate.roadmapItems).toHaveLength(1);
    expect(r.willCreate.tasks).toHaveLength(2);
    expect(r.willCreate.dependencyEdges).toEqual([
      { from: "Create setup wizard", to: "Add setup tests" },
    ]);
    expect(r.errors).toEqual([]);
    // Side-check: nothing got into roadmap.json or tasks/.
    const rs = new RoadmapService(projectRoot);
    expect(await rs.listRoadmapItems()).toEqual([]);
    expect(await rs.listTasks()).toEqual([]);
  });

  it("treats unresolved DEPENDS_ON as a fatal error in dry-run", async () => {
    const broken = `AMACO_TASK:\nTITLE: A\nDEPENDS_ON: ghost-not-here\n`;
    const ps = new ProposalService(projectRoot);
    await ps.writeProposalText("broken", broken);
    const r = await ps.dryRun({ proposalId: "broken" });
    expect(
      r.errors.some((e) => /Unresolved DEPENDS_ON/.test(e.message)),
    ).toBe(true);
  });

  it("--allow-unresolved-dependencies downgrades unresolved deps to warnings", async () => {
    const broken = `AMACO_TASK:\nTITLE: A\nDEPENDS_ON: ghost-not-here\n`;
    const ps = new ProposalService(projectRoot);
    await ps.writeProposalText("broken", broken);
    const r = await ps.dryRun({
      proposalId: "broken",
      allowUnresolvedDependencies: true,
    });
    expect(r.errors).toEqual([]);
  });

  it("detects cycles in proposed task dependencies", async () => {
    const cyc = `AMACO_TASK:\nTITLE: A\nDEPENDS_ON: B\n\nAMACO_TASK:\nTITLE: B\nDEPENDS_ON: A\n`;
    const ps = new ProposalService(projectRoot);
    await ps.writeProposalText("cycle", cyc);
    const r = await ps.dryRun({ proposalId: "cycle" });
    expect(r.cycle.length).toBeGreaterThan(0);
    expect(r.errors.some((e) => /Cycle detected/.test(e.message))).toBe(true);
  });
});

describe("ProposalService — accept (atomic)", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
    const ps = new ProposalService(projectRoot);
    await ps.init();
    await ps.writeProposalText("demo", happy);
  });

  it("creates roadmap items + tasks + dependency edges and writes the audit file", async () => {
    const ps = new ProposalService(projectRoot);
    const result = await ps.accept({ proposalId: "demo" });
    expect(result.createdRoadmapItemIds).toHaveLength(1);
    expect(result.createdTaskIds).toHaveLength(2);
    expect(result.dependencyCount).toBe(1);

    // Audit file present.
    const audit = await ps.readAuditIfPresent("demo");
    expect(audit?.proposalId).toBe("demo");
    expect(audit?.createdTaskIds.length).toBe(2);

    // Tasks linked back to the roadmap item, and the dependency by id.
    const rs = new RoadmapService(projectRoot);
    const items = await rs.listRoadmapItems();
    expect(items[0]!.title).toBe("Build onboarding");
    const tasks = await rs.listTasks();
    const setup = tasks.find((t) => t.title === "Create setup wizard")!;
    const tests = tasks.find((t) => t.title === "Add setup tests")!;
    expect(tests.dependencies).toEqual([setup.id]);
    // touchedFiles preserved.
    expect(setup.touchedFiles).toEqual(["src/cli/commands/setup.ts"]);
  });

  it("dryRun option from accept() does not write anything", async () => {
    const ps = new ProposalService(projectRoot);
    const r = await ps.accept({
      proposalId: "demo",
      options: { dryRun: true },
    });
    expect(r.createdRoadmapItemIds).toEqual([]);
    expect(r.createdTaskIds).toEqual([]);
    const rs = new RoadmapService(projectRoot);
    expect(await rs.listTasks()).toEqual([]);
  });

  it("refuses to accept the same proposal twice", async () => {
    const ps = new ProposalService(projectRoot);
    await ps.accept({ proposalId: "demo" });
    await expect(ps.accept({ proposalId: "demo" })).rejects.toThrow();
  });

  it("refuses cycles", async () => {
    const cyc = `AMACO_TASK:\nTITLE: A\nDEPENDS_ON: B\n\nAMACO_TASK:\nTITLE: B\nDEPENDS_ON: A\n`;
    const ps = new ProposalService(projectRoot);
    await ps.writeProposalText("cycle", cyc);
    await expect(ps.accept({ proposalId: "cycle" })).rejects.toThrow(/Cycle/);
    const rs = new RoadmapService(projectRoot);
    expect(await rs.listTasks()).toEqual([]);
  });

  it("rejects path traversal in proposal id", async () => {
    const ps = new ProposalService(projectRoot);
    await expect(ps.dryRun({ proposalId: "../escape" })).rejects.toThrow();
    await expect(
      ps.accept({ proposalId: "../../etc/passwd" }),
    ).rejects.toThrow();
  });
});
