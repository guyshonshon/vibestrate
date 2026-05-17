import { describe, it, expect } from "vitest";
import { keymapForPage } from "../src/shell/ink/keymaps.js";
import { PAGES_GROUP } from "../src/shell/ink/components/Footer.js";

describe("keymapForPage", () => {
  it("returns Move + Actions on Roadmap with the documented keys", () => {
    const groups = keymapForPage("roadmap");
    expect(groups.map((g) => g.name)).toEqual(["Move", "Actions"]);
    const allKeys = groups.flatMap((g) => g.hints.map((h) => h.key));
    // The acceptance criteria require these to be visible in the footer.
    for (const k of ["↑↓", "←→", "n", "e", "d", "Q", "c"]) {
      expect(allKeys).toContain(k);
    }
  });

  it("returns Move + Filter + Actions on Runs", () => {
    const groups = keymapForPage("runs");
    expect(groups.map((g) => g.name)).toEqual(["Move", "Filter", "Actions"]);
    const allKeys = groups.flatMap((g) => g.hints.map((h) => h.key));
    for (const k of ["↑↓", "tab", "/", "p", "r", "a"]) {
      expect(allKeys).toContain(k);
    }
  });

  it("Dashboard relies on the universal Pages group only", () => {
    expect(keymapForPage("dashboard")).toEqual([]);
  });

  it("PAGES_GROUP carries the number-switch hint a new user needs", () => {
    const keys = PAGES_GROUP.hints.map((h) => h.key);
    expect(keys).toContain("1-9/0");
    expect(keys).toContain("?");
    expect(keys).toContain("q");
  });
});
