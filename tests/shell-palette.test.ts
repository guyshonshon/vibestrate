import { describe, it, expect } from "vitest";
import {
  DEFAULT_PALETTE,
  filterPalette,
  scoreCommand,
} from "../src/shell/ink/palette.js";

describe("PaletteCommand catalog", () => {
  it("every entry carries enough teaching material (description or examples or cli)", () => {
    for (const cmd of DEFAULT_PALETTE) {
      expect(
        cmd.description || cmd.cli || (cmd.examples && cmd.examples.length > 0),
      ).toBeTruthy();
    }
  });

  it("every entry has a short hint shown next to the title", () => {
    for (const cmd of DEFAULT_PALETTE) {
      expect(typeof cmd.hint).toBe("string");
      expect((cmd.hint ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("scoreCommand", () => {
  const goRoadmap = DEFAULT_PALETTE.find((c) => c.id === "goto.roadmap")!;
  const pauseRun = DEFAULT_PALETTE.find((c) => c.id === "run.pause")!;

  it("returns 0 for an empty query so everything stays", () => {
    expect(scoreCommand(goRoadmap, "")).toBe(0);
  });

  it("scores substring matches higher than subsequence matches", () => {
    const sub = scoreCommand(goRoadmap, "road");
    const seq = scoreCommand(goRoadmap, "rdmp");
    expect(sub).not.toBeNull();
    expect(seq).not.toBeNull();
    expect((sub ?? 0) > (seq ?? 0)).toBe(true);
  });

  it("matches keywords as well as title and id", () => {
    expect(scoreCommand(pauseRun, "stop")).not.toBeNull();
    expect(scoreCommand(pauseRun, "halt")).not.toBeNull();
  });

  it("returns null when no subsequence match exists", () => {
    expect(scoreCommand(goRoadmap, "xyzqq")).toBeNull();
  });
});

describe("filterPalette", () => {
  it("returns all entries (capped) for an empty query", () => {
    const out = filterPalette(DEFAULT_PALETTE, "", 5);
    expect(out.length).toBe(5);
  });

  it("ranks `pause` first when the query is 'pause'", () => {
    const out = filterPalette(DEFAULT_PALETTE, "pause");
    expect(out[0]?.id).toBe("run.pause");
  });

  it("`goto roadmap` style fuzz finds the roadmap target", () => {
    const out = filterPalette(DEFAULT_PALETTE, "roadmap");
    expect(out[0]?.id).toBe("goto.roadmap");
  });

  it("`exit` keyword finds the quit command", () => {
    const out = filterPalette(DEFAULT_PALETTE, "exit");
    expect(out[0]?.id).toBe("shell.quit");
  });

  it("limits results to the cap", () => {
    expect(filterPalette(DEFAULT_PALETTE, "", 3).length).toBe(3);
  });
});
