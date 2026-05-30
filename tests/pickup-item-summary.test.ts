import { describe, it, expect } from "vitest";
import {
  buildPriorItemsContext,
  renderItemSummaryArtifact,
  renderCurrentItemBrief,
  compactImplementationSummary,
  type ChecklistItemOutcome,
} from "../src/pickup/item-summary.js";

function outcome(
  i: number,
  over: Partial<ChecklistItemOutcome> = {},
): ChecklistItemOutcome {
  return {
    itemId: `ci-${i}`,
    index: i,
    total: 5,
    text: `item ${i}`,
    status: "done",
    commitSha: `${"abcdef12".repeat(5)}`.slice(0, 40),
    filesTouched: [`src/file${i}.ts`],
    summary: `did the work for item ${i}`,
    error: null,
    ...over,
  };
}

describe("forward-carry: renderItemSummaryArtifact", () => {
  it("renders status, short commit, files and summary", () => {
    const md = renderItemSummaryArtifact(outcome(0));
    expect(md).toContain("Item 1/5 — item 0");
    expect(md).toContain("status: done");
    expect(md).toContain("commit: abcdef12");
    expect(md).toContain("src/file0.ts");
    expect(md).toContain("did the work for item 0");
  });

  it("includes an error line for a blocked item", () => {
    const md = renderItemSummaryArtifact(
      outcome(1, { status: "blocked", error: "validation failed", commitSha: null }),
    );
    expect(md).toContain("status: blocked");
    expect(md).toContain("commit: (uncommitted)");
    expect(md).toContain("error: validation failed");
  });
});

describe("forward-carry: buildPriorItemsContext", () => {
  it("is empty with no completed items", () => {
    expect(buildPriorItemsContext([])).toBe("");
  });

  it("lists completed items with notes and files (full mode under budget)", () => {
    const ctx = buildPriorItemsContext([outcome(0), outcome(1)]);
    expect(ctx).toContain("Completed checklist items");
    expect(ctx).toContain("1. item 0 — done");
    expect(ctx).toContain("did the work for item 0");
    expect(ctx).toContain("files: src/file0.ts");
    expect(ctx).toContain("2. item 1 — done");
  });

  it("folds older items to one line when over the char budget", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      outcome(i, { summary: "x".repeat(300), filesTouched: ["a.ts", "b.ts"] }),
    );
    const tight = buildPriorItemsContext(many, 600);
    // Every item is still listed…
    for (let i = 1; i <= 8; i++) expect(tight).toContain(`${i}. item ${i - 1} —`);
    // …but the oldest lost its long note (folded to terse).
    const firstBlock = tight.slice(tight.indexOf("1. item 0"), tight.indexOf("2. item 1"));
    expect(firstBlock).not.toContain("xxxxx");
    // The result respects the budget closely (within the header overhead).
    expect(tight.length).toBeLessThan(1200);
  });

  it("keeps the most recent item's detail when folding", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      outcome(i, { summary: `note-for-${i} ${"y".repeat(200)}` }),
    );
    const ctx = buildPriorItemsContext(many, 500);
    // The last item keeps its note even under pressure.
    expect(ctx).toContain("note-for-5");
  });
});

describe("forward-carry: misc renderers", () => {
  it("renderCurrentItemBrief scopes to the single item", () => {
    const brief = renderCurrentItemBrief({ text: "wire the handler" }, 2, 4);
    expect(brief).toContain("Current checklist item — 3 of 4");
    expect(brief).toContain("wire the handler");
    expect(brief).toContain("Focus ONLY on this item");
  });

  it("compactImplementationSummary truncates long text", () => {
    expect(compactImplementationSummary("short")).toBe("short");
    const long = compactImplementationSummary("z".repeat(1000), 600);
    expect(long.length).toBeLessThanOrEqual(601);
    expect(long.endsWith("…")).toBe(true);
  });
});
