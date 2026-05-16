// Pure scheduling picker. Decides which queue entry the scheduler
// should consider next, given the current in-flight set, the queue
// policy, and any per-source quotas. No I/O — the service layer
// supplies snapshots and acts on the verdict.

import type { Priority } from "../roadmap/roadmap-types.js";
import type { QueueEntry } from "./scheduler-types.js";

export type QueuePolicy = "fifo" | "priority" | "fair";

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export type PickerInput = {
  queue: ReadonlyArray<QueueEntry>;
  /**
   * Sources of the tasks currently in flight. One entry per running
   * task (duplicates encode the in-flight count per source).
   */
  inflightSources: ReadonlyArray<string>;
  config: {
    queuePolicy: QueuePolicy;
    maxConcurrentRuns: number;
    sourceQuotas: Readonly<Record<string, number>>;
    defaultSourceConcurrency?: number;
  };
  /**
   * Predicate returning true when the entry is *eligible* to start —
   * usually "dependencies are satisfied". The picker treats false as
   * "skip and try the next one"; it does not remove the entry.
   */
  isEligible: (entry: QueueEntry) => boolean;
};

export type PickerVerdict =
  | { kind: "pick"; entry: QueueEntry }
  | { kind: "at-capacity" }
  | { kind: "empty" }
  | { kind: "all-blocked"; reasons: Array<{ taskId: string; reason: "deps" | "quota" }> };

function inflightCount(
  sources: ReadonlyArray<string>,
  source: string,
): number {
  let n = 0;
  for (const s of sources) if (s === source) n += 1;
  return n;
}

function quotaFor(
  source: string,
  quotas: Readonly<Record<string, number>>,
  defaultCap: number | undefined,
): number {
  const explicit = quotas[source];
  if (typeof explicit === "number") return explicit;
  return defaultCap ?? Number.POSITIVE_INFINITY;
}

/**
 * Order a snapshot of queue entries by the configured policy.
 * - fifo:     enqueue order (input order)
 * - priority: high → low, FIFO within same priority
 * - fair:     by fewest in-flight for that source first, then FIFO
 */
export function orderQueue(
  entries: ReadonlyArray<QueueEntry>,
  policy: QueuePolicy,
  inflightSources: ReadonlyArray<string>,
): QueueEntry[] {
  if (policy === "fifo") return [...entries];
  if (policy === "priority") {
    return [...entries].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority];
      const pb = PRIORITY_RANK[b.priority];
      if (pa !== pb) return pa - pb;
      return a.enqueuedAt.localeCompare(b.enqueuedAt);
    });
  }
  // fair: per-source round-robin. Compute in-flight per source once
  // and rank entries by (their source's load, enqueuedAt). Stable on
  // ties so two entries from the same source preserve enqueue order.
  return [...entries].sort((a, b) => {
    const la = inflightCount(inflightSources, a.source);
    const lb = inflightCount(inflightSources, b.source);
    if (la !== lb) return la - lb;
    return a.enqueuedAt.localeCompare(b.enqueuedAt);
  });
}

export function pickNextEntry(input: PickerInput): PickerVerdict {
  if (input.queue.length === 0) return { kind: "empty" };
  if (input.inflightSources.length >= input.config.maxConcurrentRuns) {
    return { kind: "at-capacity" };
  }
  const ordered = orderQueue(
    input.queue,
    input.config.queuePolicy,
    input.inflightSources,
  );
  const skipped: Array<{ taskId: string; reason: "deps" | "quota" }> = [];
  for (const entry of ordered) {
    if (!input.isEligible(entry)) {
      skipped.push({ taskId: entry.taskId, reason: "deps" });
      continue;
    }
    const cap = quotaFor(
      entry.source,
      input.config.sourceQuotas,
      input.config.defaultSourceConcurrency,
    );
    const used = inflightCount(input.inflightSources, entry.source);
    if (used >= cap) {
      skipped.push({ taskId: entry.taskId, reason: "quota" });
      continue;
    }
    return { kind: "pick", entry };
  }
  return { kind: "all-blocked", reasons: skipped };
}
