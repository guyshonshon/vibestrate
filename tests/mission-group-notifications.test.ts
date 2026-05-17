import { describe, it, expect } from "vitest";
import {
  fingerprint,
  groupNotifications,
} from "../src/ui/components/mission/groupNotifications.js";
import type { NotificationRecord } from "../src/ui/lib/types.js";

function n(
  partial: Partial<NotificationRecord> & {
    id: string;
    createdAt: string;
    message: string;
  },
): NotificationRecord {
  return {
    id: partial.id,
    createdAt: partial.createdAt,
    updatedAt: partial.createdAt,
    severity: partial.severity ?? "attention",
    category: partial.category ?? "run",
    title: partial.title ?? "",
    message: partial.message,
    runId: partial.runId ?? null,
    taskId: null,
    roadmapItemId: null,
    approvalId: null,
    eventId: null,
    sourceEventType: null,
    actionRequired: partial.actionRequired ?? false,
    actionLabel: null,
    actionUrl: null,
    readAt: partial.readAt ?? null,
    resolvedAt: null,
    metadata: {},
  } as NotificationRecord;
}

describe("groupNotifications", () => {
  it("normalizes run ids out of the fingerprint", () => {
    expect(fingerprint("Run run-abc-1 failed at planning")).toBe(
      "run <run> failed at planning",
    );
    expect(fingerprint("Run run-xyz-2 failed at planning")).toBe(
      fingerprint("Run run-abc-1 failed at planning"),
    );
  });

  it("collapses identical messages across different runs", () => {
    const groups = groupNotifications([
      n({
        id: "a",
        createdAt: "2026-05-17T10:00:00Z",
        message: "Run run-1 failed at planning",
        runId: "run-1",
      }),
      n({
        id: "b",
        createdAt: "2026-05-17T10:05:00Z",
        message: "Run run-2 failed at planning",
        runId: "run-2",
      }),
      n({
        id: "c",
        createdAt: "2026-05-17T10:10:00Z",
        message: "Approval requested",
        runId: "run-2",
      }),
    ]);
    expect(groups).toHaveLength(2);
    const failed = groups.find((g) => g.message.includes("failed at planning"))!;
    expect(failed.count).toBe(2);
    expect(failed.runIds.sort()).toEqual(["run-1", "run-2"]);
    expect(failed.latest.id).toBe("b"); // newest of the two
  });

  it("promotes the highest severity in the group", () => {
    const groups = groupNotifications([
      n({
        id: "a",
        createdAt: "2026-05-17T10:00:00Z",
        message: "Run run-1 failed",
        severity: "warning",
        runId: "run-1",
      }),
      n({
        id: "b",
        createdAt: "2026-05-17T10:01:00Z",
        message: "Run run-2 failed",
        severity: "critical",
        runId: "run-2",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.severity).toBe("critical");
  });

  it("counts unread separately from total", () => {
    const groups = groupNotifications([
      n({
        id: "a",
        createdAt: "2026-05-17T10:00:00Z",
        message: "Run run-1 failed",
        readAt: "2026-05-17T10:01:00Z",
        runId: "run-1",
      }),
      n({
        id: "b",
        createdAt: "2026-05-17T10:02:00Z",
        message: "Run run-2 failed",
        runId: "run-2",
      }),
    ]);
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.unread).toBe(1);
  });
});
