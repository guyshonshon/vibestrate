import { describe, it, expect } from "vitest";
import { mdCell } from "../src/utils/markdown-cell.js";

/**
 * Five report writers each escaped the pipe and forgot the backslash. A run
 * title is user-supplied text, so `C:\path\` in a title was enough to break a
 * row open and shift every later column - in the final report, which is the
 * artifact a human reads to decide whether to merge.
 */
describe("mdCell", () => {
  it("escapes the backslash BEFORE the pipe", () => {
    // The bug: escaping only the pipe turns this into `a\\|b` - an escaped
    // backslash followed by a live pipe, which opens a new cell.
    expect(mdCell("a\\|b")).toBe("a\\\\\\|b");
    expect(mdCell("ends with a backslash\\")).toBe("ends with a backslash\\\\");
  });

  it("keeps a pipe inside the cell", () => {
    expect(mdCell("a|b")).toBe("a\\|b");
  });

  it("flattens newlines, which would otherwise end the row", () => {
    expect(mdCell("line one\nline two")).toBe("line one line two");
    expect(mdCell("crlf\r\nrow")).toBe("crlf row");
  });

  it("renders an absent value as the table's own placeholder", () => {
    expect(mdCell(null)).toBe("-");
    expect(mdCell(undefined)).toBe("-");
    expect(mdCell("")).toBe("-");
  });

  it("leaves ordinary text alone", () => {
    expect(mdCell("Add a /healthz endpoint")).toBe("Add a /healthz endpoint");
  });
});
