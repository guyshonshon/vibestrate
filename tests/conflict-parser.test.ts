import { describe, it, expect } from "vitest";
import {
  parseConflictHunks,
  hasConflictMarkers,
  isLikelyBinary,
} from "../src/git/conflict-parser.js";

const NUL = String.fromCharCode(0);

describe("parseConflictHunks", () => {
  it("parses a single 2-way conflict", () => {
    const content = [
      "context before",
      "<<<<<<< HEAD",
      "our line",
      "=======",
      "their line",
      ">>>>>>> feat",
      "context after",
    ].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hunks).toHaveLength(1);
      expect(r.hunks[0]).toMatchObject({
        index: 0,
        ours: "our line",
        theirs: "their line",
        base: null,
      });
    }
  });

  it("parses a diff3 conflict with a base section", () => {
    const content = [
      "<<<<<<< HEAD",
      "ours",
      "||||||| base",
      "original",
      "=======",
      "theirs",
      ">>>>>>> feat",
    ].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hunks[0]).toMatchObject({ ours: "ours", base: "original", theirs: "theirs" });
  });

  it("parses multiple conflict regions", () => {
    const content = [
      "<<<<<<< HEAD", "a1", "=======", "b1", ">>>>>>> x",
      "shared",
      "<<<<<<< HEAD", "a2", "=======", "b2", ">>>>>>> x",
    ].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hunks).toHaveLength(2);
      expect(r.hunks.map((h) => h.ours)).toEqual(["a1", "a2"]);
      expect(r.hunks.map((h) => h.theirs)).toEqual(["b1", "b2"]);
    }
  });

  it("rejects a nested start marker", () => {
    const content = ["<<<<<<< HEAD", "x", "<<<<<<< again", "=======", "y", ">>>>>>> z"].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/nested/);
  });

  it("rejects a separator with no open conflict", () => {
    // A real `=======` appearing while inside a region but with no opener is
    // caught; here the opener is absent so it's treated as content and there
    // are no hunks -> rejected as "no conflict regions".
    const content = ["just", "=======", "text"].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(false);
  });

  it("rejects an unterminated conflict (EOF mid-region)", () => {
    const content = ["<<<<<<< HEAD", "ours", "=======", "theirs"].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unterminated/);
  });

  it("rejects an end marker out of order", () => {
    const content = ["<<<<<<< HEAD", "ours", ">>>>>>> z"].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(false);
  });

  it("ignores marker-shaped lines outside a conflict region", () => {
    const content = [
      "=======",
      "a heading underline, not a conflict",
      "<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> z",
    ].join("\n");
    const r = parseConflictHunks(content);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hunks).toHaveLength(1);
  });
});

describe("hasConflictMarkers / isLikelyBinary", () => {
  it("detects conflict markers", () => {
    expect(hasConflictMarkers("a\n<<<<<<< HEAD\nb")).toBe(true);
    expect(hasConflictMarkers("no markers here")).toBe(false);
  });
  it("detects a NUL byte as binary", () => {
    expect(isLikelyBinary(`text${NUL}more`)).toBe(true);
    expect(isLikelyBinary("plain text")).toBe(false);
  });
});
