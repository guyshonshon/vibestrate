import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  computeDailySpendUsd,
  evaluateSpendCap,
} from "../src/core/spend-cap-service.js";
import type { BudgetConfig } from "../src/project/config-schema.js";

function budget(over: Partial<BudgetConfig>): BudgetConfig {
  return { spendCapDailyUsd: null, capAction: "stop", warnThresholdPct: 0.8, ...over };
}

describe("evaluateSpendCap", () => {
  it("is ok with no cap", () => {
    expect(evaluateSpendCap(budget({ spendCapDailyUsd: null }), 999).state).toBe("ok");
    expect(evaluateSpendCap(budget({ spendCapDailyUsd: 0 }), 999).state).toBe("ok");
  });

  it("warns at the threshold, exceeds at the cap, and carries the action", () => {
    const b = budget({ spendCapDailyUsd: 10, warnThresholdPct: 0.8, capAction: "reduce-effort" });
    expect(evaluateSpendCap(b, 5).state).toBe("ok");
    expect(evaluateSpendCap(b, 8).state).toBe("warn");
    expect(evaluateSpendCap(b, 8).action).toBeNull();
    const hit = evaluateSpendCap(b, 10.5);
    expect(hit.state).toBe("exceeded");
    expect(hit.action).toBe("reduce-effort");
    expect(hit.cap).toBe(10);
  });
});

describe("computeDailySpendUsd", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-spend-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function writeRunMetrics(runId: string, totalCostUsd: number, updatedAt: string): Promise<void> {
    const dir = path.join(root, ".vibestrate", "runs", runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "runtime-metrics.json"),
      JSON.stringify({
        runId,
        task: "t",
        startedAt: updatedAt,
        updatedAt,
        finalStatus: "merge_ready",
        totalDurationMs: 0,
        totalProviderCalls: 0,
        totalCostUsd,
        reviewLoopCount: 0,
        filesChanged: null,
        diffInsertions: null,
        diffDeletions: null,
        validationSummary: null,
        roles: [],
      }),
    );
  }

  it("sums today's run costs, ignoring other days and cost-less runs", async () => {
    const now = Date.now();
    const today = new Date(now).toISOString();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000 - 60_000).toISOString();
    await writeRunMetrics("a", 0.5, today);
    await writeRunMetrics("b", 1.25, today);
    await writeRunMetrics("c", 99, yesterday); // different day → excluded
    const spend = await computeDailySpendUsd(root, now);
    expect(spend).toBeCloseTo(1.75, 5);
  });

  it("is 0 when there are no runs", async () => {
    expect(await computeDailySpendUsd(root)).toBe(0);
  });
});
