import { describe, it, expect } from "vitest";
import {
  looksVerbose,
  windowFromBottom,
  windowFromTop,
} from "../src/shell/ink/output-window.js";

const lines = ["a", "b", "c", "d", "e"];

describe("looksVerbose", () => {
  it("is false for empty / short output", () => {
    expect(looksVerbose("")).toBe(false);
    expect(looksVerbose("   \n  ")).toBe(false);
    expect(looksVerbose("ok\nexit 0")).toBe(false);
  });
  it("is true when there are many lines", () => {
    const many = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    expect(looksVerbose(many)).toBe(true);
  });
  it("is true when any line is wide (truncates badly in the narrow pane)", () => {
    expect(looksVerbose("x".repeat(80))).toBe(true);
  });
  it("respects custom thresholds", () => {
    expect(looksVerbose("a\nb\nc", { maxLines: 2 })).toBe(true);
    expect(looksVerbose("abcd", { maxWidth: 3 })).toBe(true);
  });
});

describe("windowFromBottom", () => {
  it("returns everything when it fits", () => {
    const w = windowFromBottom(lines, 0, 10);
    expect(w.lines).toEqual(lines);
    expect(w.above).toBe(0);
    expect(w.below).toBe(0);
  });
  it("follows the tail at scroll 0", () => {
    const w = windowFromBottom(lines, 0, 2);
    expect(w.lines).toEqual(["d", "e"]);
    expect(w.above).toBe(3);
    expect(w.below).toBe(0);
  });
  it("scrolls up and reports lines below", () => {
    const w = windowFromBottom(lines, 2, 2);
    expect(w.lines).toEqual(["b", "c"]);
    expect(w.above).toBe(1);
    expect(w.below).toBe(2);
  });
  it("clamps scroll past the top", () => {
    const w = windowFromBottom(lines, 999, 2);
    expect(w.lines).toEqual(["a", "b"]);
    expect(w.above).toBe(0);
  });
});

describe("windowFromTop", () => {
  it("anchors to the top and reports lines below", () => {
    const w = windowFromTop(lines, 0, 2);
    expect(w.lines).toEqual(["a", "b"]);
    expect(w.above).toBe(0);
    expect(w.below).toBe(3);
  });
  it("scrolls down", () => {
    const w = windowFromTop(lines, 2, 2);
    expect(w.lines).toEqual(["c", "d"]);
    expect(w.above).toBe(2);
    expect(w.below).toBe(1);
  });
  it("is generic over the element type", () => {
    const objs = [{ n: 1 }, { n: 2 }, { n: 3 }];
    expect(windowFromTop(objs, 0, 2).lines).toEqual([{ n: 1 }, { n: 2 }]);
  });
});
