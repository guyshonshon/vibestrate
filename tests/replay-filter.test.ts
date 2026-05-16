import { describe, it, expect } from "vitest";
import { filterReplayEvents } from "../src/ui/components/replay/replay-filter.js";
import type { ReplayEvent, ReplayPhaseKey } from "../src/ui/lib/types.js";

function ev(
  index: number,
  type: string,
  message: string,
  phaseKey: ReplayPhaseKey,
): ReplayEvent {
  return {
    index,
    timestamp: `2026-05-12T10:00:0${index}.000Z`,
    source: "event",
    type,
    message,
    data: null,
    phaseKey,
    artifactRefs: [],
  };
}

const FIXTURE: ReplayEvent[] = [
  ev(0, "state.changed", "planning → architecting", "planning"),
  ev(1, "approval.requested", "Approval requested by agent-a", "approvals"),
  ev(2, "approval.approved", "Approved by local-user", "approvals"),
  ev(3, "suggestion.created", "suggestion sug-1: Add retry", "suggestions"),
  ev(4, "validation.started", "Running pnpm test", "validating"),
  ev(5, "validation.command.completed", "pnpm test passed", "validating"),
  ev(6, "notification.created", "Approval resolved", "notifications"),
];

describe("filterReplayEvents", () => {
  it("returns every index when both search and phases are empty", () => {
    const out = filterReplayEvents(FIXTURE, {
      search: "",
      phases: new Set(),
    });
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("treats whitespace-only search as empty", () => {
    const out = filterReplayEvents(FIXTURE, {
      search: "   ",
      phases: new Set(),
    });
    expect(out).toHaveLength(FIXTURE.length);
  });

  it("matches case-insensitively against ev.type", () => {
    // Searching for "APPROVAL" catches event types approval.requested /
    // approval.approved AND the notification with message "Approval
    // resolved" — both type and message are concatenated for the search.
    const out = filterReplayEvents(FIXTURE, {
      search: "APPROVAL",
      phases: new Set(),
    });
    expect(out).toEqual([1, 2, 6]);
  });

  it("matches case-insensitively against ev.message even when type is unrelated", () => {
    const out = filterReplayEvents(FIXTURE, {
      search: "retry",
      phases: new Set(),
    });
    // sug-1 has the word "retry" in its message but its type is
    // "suggestion.created" — it must still match.
    expect(out).toEqual([3]);
  });

  it("treats an empty phases set as wildcard (not 'show nothing')", () => {
    // Regression guard: an earlier draft hid every row when no chip was
    // active; that's the wrong default for a filter bar.
    const out = filterReplayEvents(FIXTURE, {
      search: "",
      phases: new Set<ReplayPhaseKey>(),
    });
    expect(out).toHaveLength(FIXTURE.length);
  });

  it("restricts to the selected phases when the set is non-empty", () => {
    const out = filterReplayEvents(FIXTURE, {
      search: "",
      phases: new Set<ReplayPhaseKey>(["approvals", "notifications"]),
    });
    expect(out).toEqual([1, 2, 6]);
  });

  it("AND-combines search + phase filter", () => {
    const out = filterReplayEvents(FIXTURE, {
      search: "approved",
      phases: new Set<ReplayPhaseKey>(["approvals"]),
    });
    expect(out).toEqual([2]);
  });

  it("returns no indices when search and phase combine to nothing", () => {
    const out = filterReplayEvents(FIXTURE, {
      search: "approved",
      phases: new Set<ReplayPhaseKey>(["validating"]),
    });
    expect(out).toEqual([]);
  });

  it("preserves original event order in the output", () => {
    // Even when phases come in a different order, output follows the
    // event array order (which is timestamp-sorted upstream).
    const out = filterReplayEvents(FIXTURE, {
      search: "",
      phases: new Set<ReplayPhaseKey>([
        "notifications",
        "planning",
        "approvals",
      ]),
    });
    expect(out).toEqual([0, 1, 2, 6]);
  });
});
