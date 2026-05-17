import { describe, it, expect } from "vitest";
import {
  pendingControls,
  renderControlNotes,
  type RunControlDirective,
} from "../src/core/run-control.js";

function mk(
  id: string,
  partial: Partial<RunControlDirective> = {},
): RunControlDirective {
  return {
    id,
    createdAt: "2026-05-17T12:00:00Z",
    consumedAt: null,
    consumedByAgent: null,
    kind: "inject-note",
    body: "ignore caching for this stage",
    ...partial,
  } as RunControlDirective;
}

describe("pendingControls", () => {
  it("filters out consumed directives", () => {
    const all: RunControlDirective[] = [
      mk("a"),
      mk("b", { consumedAt: "2026-05-17T12:01:00Z", consumedByAgent: "planner" }),
      mk("c", { kind: "compact" } as Partial<RunControlDirective>),
    ];
    expect(pendingControls(all).map((d) => d.id)).toEqual(["a", "c"]);
  });
});

describe("renderControlNotes", () => {
  it("returns empty string when nothing pending", () => {
    expect(renderControlNotes([])).toBe("");
  });

  it("renders inject-note as a markdown user-note section", () => {
    const out = renderControlNotes([mk("a", { body: "skip the cache layer" })]);
    expect(out).toMatch(/## Note from the user/);
    expect(out).toMatch(/skip the cache layer/);
  });

  it("renders compact directive with re-state instruction + optional rationale", () => {
    const plain = renderControlNotes([
      mk("a", { kind: "compact" } as Partial<RunControlDirective>),
    ]);
    expect(plain).toMatch(/Context compaction requested/);
    expect(plain).toMatch(/re-state your understanding/i);

    const withReason = renderControlNotes([
      mk("a", {
        kind: "compact",
        note: "we drifted into unrelated refactors",
      } as Partial<RunControlDirective>),
    ]);
    expect(withReason).toMatch(/Rationale: we drifted/);
  });

  it("preserves order across multiple directives", () => {
    const out = renderControlNotes([
      mk("a", { body: "first" }),
      mk("b", { body: "second" }),
    ]);
    expect(out.indexOf("first")).toBeLessThan(out.indexOf("second"));
  });
});
