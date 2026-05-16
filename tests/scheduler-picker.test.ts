import { describe, it, expect } from "vitest";
import { orderQueue, pickNextEntry } from "../src/scheduler/picker.js";
import type { QueueEntry } from "../src/scheduler/scheduler-types.js";

function entry(
  taskId: string,
  source: string,
  enqueuedAt: string,
  priority: "low" | "medium" | "high" = "medium",
): QueueEntry {
  return { taskId, source, enqueuedAt, priority };
}

const allReady = () => true;

describe("orderQueue", () => {
  const entries: QueueEntry[] = [
    entry("a", "user", "2026-01-01T00:00:00Z", "low"),
    entry("b", "cron", "2026-01-02T00:00:00Z", "high"),
    entry("c", "user", "2026-01-03T00:00:00Z", "medium"),
  ];

  it("fifo preserves enqueue order", () => {
    expect(orderQueue(entries, "fifo", []).map((e) => e.taskId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("priority sorts high → low with FIFO within ties", () => {
    expect(orderQueue(entries, "priority", []).map((e) => e.taskId)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("fair sorts by in-flight load per source first, then FIFO", () => {
    // user already has one task running, cron has none → cron should win.
    expect(
      orderQueue(entries, "fair", ["user"]).map((e) => e.taskId),
    ).toEqual(["b", "a", "c"]);
  });
});

describe("pickNextEntry", () => {
  it('returns "empty" when the queue is empty', () => {
    const v = pickNextEntry({
      queue: [],
      inflightSources: [],
      config: { queuePolicy: "fifo", maxConcurrentRuns: 1, sourceQuotas: {} },
      isEligible: allReady,
    });
    expect(v.kind).toBe("empty");
  });

  it('returns "at-capacity" when in-flight >= maxConcurrentRuns', () => {
    const v = pickNextEntry({
      queue: [entry("a", "user", "t0")],
      inflightSources: ["user", "user"],
      config: { queuePolicy: "fifo", maxConcurrentRuns: 2, sourceQuotas: {} },
      isEligible: allReady,
    });
    expect(v.kind).toBe("at-capacity");
  });

  it("respects per-source quotas — picks a different source when one is at quota", () => {
    const queue = [
      entry("u1", "user", "t1"),
      entry("c1", "cron", "t2"),
    ];
    const v = pickNextEntry({
      queue,
      inflightSources: ["user"],
      config: {
        queuePolicy: "fifo",
        maxConcurrentRuns: 4,
        sourceQuotas: { user: 1, cron: 2 },
      },
      isEligible: allReady,
    });
    expect(v.kind).toBe("pick");
    if (v.kind === "pick") expect(v.entry.taskId).toBe("c1");
  });

  it('returns "all-blocked" with reasons when every candidate is dep- or quota-blocked', () => {
    const queue = [
      entry("u1", "user", "t1"),
      entry("c1", "cron", "t2"),
    ];
    const v = pickNextEntry({
      queue,
      inflightSources: ["user", "cron"],
      config: {
        queuePolicy: "fifo",
        maxConcurrentRuns: 4,
        sourceQuotas: { user: 1, cron: 1 },
      },
      isEligible: allReady,
    });
    expect(v.kind).toBe("all-blocked");
    if (v.kind === "all-blocked") {
      expect(v.reasons.map((r) => r.reason)).toEqual(["quota", "quota"]);
    }
  });

  it("defaultSourceConcurrency applies to sources with no explicit quota", () => {
    const queue = [
      entry("misc1", "scratch", "t1"),
      entry("misc2", "scratch", "t2"),
    ];
    const v = pickNextEntry({
      queue,
      inflightSources: ["scratch"],
      config: {
        queuePolicy: "fifo",
        maxConcurrentRuns: 4,
        sourceQuotas: {},
        defaultSourceConcurrency: 1,
      },
      isEligible: allReady,
    });
    expect(v.kind).toBe("all-blocked");
  });

  it("fair rotation: picks the under-loaded source even if it was enqueued later", () => {
    const queue = [
      // user enqueued first but is already running 2; cron is later but idle.
      entry("u1", "user", "t1"),
      entry("u2", "user", "t2"),
      entry("c1", "cron", "t3"),
    ];
    const v = pickNextEntry({
      queue,
      inflightSources: ["user", "user"],
      config: {
        queuePolicy: "fair",
        maxConcurrentRuns: 4,
        sourceQuotas: {},
      },
      isEligible: allReady,
    });
    expect(v.kind).toBe("pick");
    if (v.kind === "pick") expect(v.entry.taskId).toBe("c1");
  });

  it("dep-blocked entries are skipped and reported in the all-blocked verdict", () => {
    const queue = [entry("blocked", "user", "t1")];
    const v = pickNextEntry({
      queue,
      inflightSources: [],
      config: { queuePolicy: "fifo", maxConcurrentRuns: 1, sourceQuotas: {} },
      isEligible: () => false,
    });
    expect(v.kind).toBe("all-blocked");
    if (v.kind === "all-blocked") {
      expect(v.reasons).toEqual([{ taskId: "blocked", reason: "deps" }]);
    }
  });

  it("when both a quota-blocked and an eligible entry exist, the eligible one wins regardless of order", () => {
    const queue = [
      entry("u1", "user", "t1"),
      entry("c1", "cron", "t2"),
    ];
    const v = pickNextEntry({
      queue,
      inflightSources: ["user", "user"],
      config: {
        queuePolicy: "fifo",
        maxConcurrentRuns: 4,
        sourceQuotas: { user: 2 },
      },
      isEligible: allReady,
    });
    expect(v.kind).toBe("pick");
    if (v.kind === "pick") expect(v.entry.taskId).toBe("c1");
  });
});
