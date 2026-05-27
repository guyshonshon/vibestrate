import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { MetricsStore } from "../src/core/metrics-store.js";
import { makeEmptyMetrics } from "../src/core/runtime-metrics.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-metrics-"));
}

describe("MetricsStore", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("writes and reads runtime-metrics.json", async () => {
    const store = new MetricsStore(projectRoot, "r1");
    await store.write(
      makeEmptyMetrics({
        runId: "r1",
        task: "demo",
        startedAt: new Date().toISOString(),
      }),
    );
    const round = await store.read();
    expect(round?.runId).toBe("r1");
    expect(round?.roles).toEqual([]);
  });

  it("appendRoleMetrics adds an agent and recomputes totals", async () => {
    const store = new MetricsStore(projectRoot, "r1");
    await store.write(
      makeEmptyMetrics({
        runId: "r1",
        task: "demo",
        startedAt: new Date().toISOString(),
      }),
    );
    await store.appendRoleMetrics({
      roleId: "planner",
      stageId: "planning",
      providerId: "claude",
      providerType: "cli",
      command: "claude",
      args: ["-p"],
      cwd: "/tmp",
      startedAt: "2026-05-09T11:00:00.000Z",
      endedAt: "2026-05-09T11:00:01.000Z",
      durationMs: 1000,
      exitCode: 0,
      sessionId: null,
      flowSlotId: null,
      flowContextMode: null,
      flowContextFallbackReason: null,
      model: null,
      totalCostUsd: null,
      perModelCost: [],
      tokenUsage: null,
      toolCallCount: null,
      filesChangedBefore: null,
      filesChangedAfter: 0,
      diffInsertionsAfter: 0,
      diffDeletionsAfter: 0,
      validationSummary: null,
      reviewDecision: null,
      verificationDecision: null,
      skillsAttached: [],
      skillsRequested: [],
      notes: [],
    });
    const r = await store.read();
    expect(r?.totalProviderCalls).toBe(1);
    expect(r?.totalDurationMs).toBe(1000);
    expect(r?.totalCostUsd).toBeNull();
  });

  it("does not fake cost or token data", async () => {
    const store = new MetricsStore(projectRoot, "r1");
    await store.write(
      makeEmptyMetrics({
        runId: "r1",
        task: "demo",
        startedAt: new Date().toISOString(),
      }),
    );
    const r = await store.read();
    expect(r?.totalCostUsd).toBeNull();
  });
});
