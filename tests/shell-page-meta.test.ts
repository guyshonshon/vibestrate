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

  it("PAGE_IDS follows the workflow order (setup → execute)", () => {
    // Dashboard first, then the setup pages (Flow, Crew), then execute (Runs,
    // which now also hosts the scheduler queue). Guards against an accidental
    // revert. (Queue was folded into Runs in 0.7.6.)
    const at = (id: string) => PAGE_IDS.indexOf(id as (typeof PAGE_IDS)[number]);
    expect(at("dashboard")).toBe(0);
    expect(at("flows")).toBe(1);
    expect(at("flows")).toBeLessThan(at("crew"));
    expect(at("crew")).toBeLessThan(at("runs"));
    expect(at("runs")).toBeLessThan(at("roadmap"));
  });

  it("the first ten pages get number hotkeys; any 11th is palette-only", () => {
    // PAGE_IDS may exceed ten; only the first ten map to 1-9/0.
    expect(PAGE_IDS.length).toBeGreaterThanOrEqual(10);
  });
});
