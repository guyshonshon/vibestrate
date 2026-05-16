import { describe, it, expect } from "vitest";
import { filterEvents } from "../src/shell/ink/event-filter.js";
import type { ShellEvent } from "../src/shell/shell-snapshot.js";

const events: ShellEvent[] = [
  { timestamp: "t0", type: "agent.started", message: "executor starting" },
  { timestamp: "t1", type: "provider.completed", message: "claude exited 0" },
  { timestamp: "t2", type: "mcp.attached", message: "Attached 2 MCP servers" },
  { timestamp: "t3", type: "approval.requested", message: "approve plan?" },
];

describe("filterEvents", () => {
  it("is a no-op for an empty query", () => {
    const r = filterEvents(events, "");
    expect(r.visible).toHaveLength(4);
    expect(r.totalCount).toBe(4);
  });

  it("filters by case-insensitive substring across type + message", () => {
    const r = filterEvents(events, "Claude");
    expect(r.visible.map((e) => e.type)).toEqual(["provider.completed"]);
  });

  it("matches event types", () => {
    const r = filterEvents(events, "mcp");
    expect(r.visible).toHaveLength(1);
    expect(r.visible[0]?.type).toBe("mcp.attached");
  });

  it("returns total count even when nothing matches", () => {
    const r = filterEvents(events, "zzz");
    expect(r.visible).toHaveLength(0);
    expect(r.totalCount).toBe(4);
  });
});
