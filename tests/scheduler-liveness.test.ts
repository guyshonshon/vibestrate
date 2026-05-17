import { describe, it, expect } from "vitest";
import { deriveSchedulerLiveness } from "../src/scheduler/scheduler-liveness.js";
import type { SchedulerState } from "../src/scheduler/scheduler-types.js";

function state(
  lastUpdatedAt: string,
  patches: Partial<SchedulerState> = {},
): SchedulerState {
  return {
    paused: false,
    runningTaskIds: [],
    lastUpdatedAt,
    maxConcurrentRuns: 1,
    conflictPolicy: "warn",
    queuePolicy: "fifo",
    sourceQuotas: {},
    ...patches,
  };
}

describe("deriveSchedulerLiveness", () => {
  it("reports never-started when the state file doesn't exist yet", () => {
    const r = deriveSchedulerLiveness(null);
    expect(r.status).toBe("never-started");
    expect(r.pickingUpWork).toBe(false);
    expect(r.summary).toMatch(/amaco queue run/);
  });

  it("reports paused when scheduler is running but paused", () => {
    const now = new Date("2026-05-17T12:00:00Z");
    const r = deriveSchedulerLiveness(
      state(now.toISOString(), { paused: true }),
      now,
    );
    expect(r.status).toBe("paused");
    expect(r.pickingUpWork).toBe(false);
    expect(r.summary).toMatch(/paused/);
  });

  it("reports live when last tick is within ~2s", () => {
    const now = new Date("2026-05-17T12:00:01Z");
    const r = deriveSchedulerLiveness(
      state("2026-05-17T12:00:00Z"),
      now,
    );
    expect(r.status).toBe("live");
    expect(r.pickingUpWork).toBe(true);
    expect(r.secondsSinceTick).toBe(1);
  });

  it("reports stale when last tick is 3-5s ago", () => {
    const now = new Date("2026-05-17T12:00:04Z");
    const r = deriveSchedulerLiveness(
      state("2026-05-17T12:00:00Z"),
      now,
    );
    expect(r.status).toBe("stale");
    // Stale is still picking up — the scheduler is slow but alive.
    expect(r.pickingUpWork).toBe(true);
  });

  it("reports offline when last tick is > 5s ago", () => {
    const now = new Date("2026-05-17T12:05:00Z");
    const r = deriveSchedulerLiveness(
      state("2026-05-17T12:00:00Z"),
      now,
    );
    expect(r.status).toBe("offline");
    expect(r.pickingUpWork).toBe(false);
    expect(r.summary).toMatch(/OFFLINE/);
    expect(r.summary).toMatch(/amaco queue run/);
  });
});
