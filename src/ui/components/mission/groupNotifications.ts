// Group repeated notifications by (category, message-fingerprint) so a
// loop of identical "run failed" messages collapses to one row.
//
// Pure: takes the recent notification list, returns groups sorted
// newest-first. Each group preserves the latest record + a count + the
// list of distinct runIds covered.

import type { NotificationRecord } from "../../lib/types.js";

export type NotificationGroup = {
  /** Stable group key — used for React keys + dedup. */
  key: string;
  category: NotificationRecord["category"];
  severity: NotificationRecord["severity"];
  message: string;
  latest: NotificationRecord;
  count: number;
  runIds: string[];
  unread: number;
};

const NORMALIZE_RE = /\brun[-_]?[a-z0-9-]+\b/gi;

/** Fingerprint a message so two "run-abc failed" + "run-def failed" group. */
export function fingerprint(message: string): string {
  return message.replace(NORMALIZE_RE, "<run>").trim().toLowerCase();
}

export function groupNotifications(
  notifications: NotificationRecord[],
): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const n of notifications) {
    const key = `${n.category}::${fingerprint(n.message)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        category: n.category,
        severity: n.severity,
        message: n.message,
        latest: n,
        count: 1,
        runIds: n.runId ? [n.runId] : [],
        unread: n.readAt ? 0 : 1,
      });
      continue;
    }
    existing.count += 1;
    if (!n.readAt) existing.unread += 1;
    if (n.runId && !existing.runIds.includes(n.runId)) {
      existing.runIds.push(n.runId);
    }
    // Keep the highest severity + the newest record as the latest.
    if (severityRank(n.severity) > severityRank(existing.severity)) {
      existing.severity = n.severity;
    }
    if (n.createdAt > existing.latest.createdAt) {
      existing.latest = n;
      existing.message = n.message;
    }
  }
  return [...groups.values()].sort((a, b) =>
    b.latest.createdAt.localeCompare(a.latest.createdAt),
  );
}

function severityRank(s: NotificationRecord["severity"]): number {
  switch (s) {
    case "critical":
      return 4;
    case "attention":
      return 3;
    case "warning":
      return 2;
    case "success":
      return 1;
    case "info":
    default:
      return 0;
  }
}
