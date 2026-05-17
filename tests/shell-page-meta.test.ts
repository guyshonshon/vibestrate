import { describe, it, expect } from "vitest";
import { PAGE_META } from "../src/shell/ink/page-meta.js";
import { PAGE_IDS } from "../src/shell/ink/ui-state.js";

describe("PAGE_META", () => {
  it("has an entry for every page id", () => {
    for (const id of PAGE_IDS) {
      expect(PAGE_META[id]).toBeDefined();
    }
  });

  it("every entry has a non-empty subtitle + blurb", () => {
    for (const id of PAGE_IDS) {
      const meta = PAGE_META[id];
      expect(meta.subtitle.length).toBeGreaterThan(0);
      expect(meta.blurb.length).toBeGreaterThan(0);
    }
  });

  it("PAGE_IDS now follows the workflow order (define → schedule → execute)", () => {
    // Roadmap should come before Runs — work is defined before it
    // executes. This is the user-facing rationale for the new tab
    // order; the test guards against an accidental revert.
    const roadmapIdx = PAGE_IDS.indexOf("roadmap");
    const runsIdx = PAGE_IDS.indexOf("runs");
    const queueIdx = PAGE_IDS.indexOf("queue");
    expect(roadmapIdx).toBeGreaterThan(-1);
    expect(roadmapIdx).toBeLessThan(queueIdx);
    expect(queueIdx).toBeLessThan(runsIdx);
  });
});
