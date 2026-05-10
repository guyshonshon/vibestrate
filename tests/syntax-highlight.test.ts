import { describe, it, expect } from "vitest";
import {
  highlightLines,
  splitHighlightedHtmlByLine,
} from "../src/ui/lib/syntax-highlight.js";

describe("highlightLines", () => {
  it("returns one entry per source line for a simple TS file", () => {
    const source = [
      "export const x = 1",
      "// comment",
      "function add(a: number) { return a + 1 }",
    ].join("\n");
    const out = highlightLines(source, "typescript");
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("export");
    expect(out[1]).toContain("hljs-comment");
    expect(out[2]).toContain("function");
  });

  it("preserves the line count for multi-line strings", () => {
    const source = [
      "const s = `multi",
      "line",
      "template`",
      "const after = 1",
    ].join("\n");
    const out = highlightLines(source, "typescript");
    expect(out).toHaveLength(4);
    // Every line is still well-formed HTML (no orphan closing tags).
    for (const line of out) {
      const opens = (line.match(/<span/g) ?? []).length;
      const closes = (line.match(/<\/span>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it("falls back to plain HTML-escaped text for unknown languages", () => {
    const out = highlightLines("a < b > c", "text");
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("a &lt; b &gt; c");
  });

  it("escapes < and > in the input even when grammar is unknown", () => {
    const out = highlightLines("<div></div>", "text");
    expect(out[0]).toBe("&lt;div&gt;&lt;/div&gt;");
  });

  it("highlights a JSON file with string + number tokens", () => {
    const out = highlightLines('{"name":"amaco","port":4317}', "json");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/hljs-(string|attr)/);
    expect(out[0]).toMatch(/hljs-(number|literal)/);
  });
});

describe("splitHighlightedHtmlByLine", () => {
  it("balances spans across newlines", () => {
    // A made-up highlighted HTML string with a span that crosses a newline.
    const html = '<span class="hljs-string">hello\nworld</span>';
    const lines = splitHighlightedHtmlByLine(html);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('<span class="hljs-string">hello</span>');
    expect(lines[1]).toBe('<span class="hljs-string">world</span>');
  });

  it("handles nested spans across newlines", () => {
    const html =
      '<span class="hljs-template-literal">hello <span class="hljs-template-variable">${x}</span>\nrest</span>';
    const lines = splitHighlightedHtmlByLine(html);
    expect(lines).toHaveLength(2);
    expect(lines[0].endsWith("</span>")).toBe(true);
    expect(lines[1].startsWith("<span")).toBe(true);
  });

  it("preserves a plain newline outside any span", () => {
    const lines = splitHighlightedHtmlByLine("a\nb");
    expect(lines).toEqual(["a", "b"]);
  });
});
