import { describe, it, expect } from "vitest";
import { parseInline, renderMarkdown } from "../src/shell/ink/markdown-render.js";

describe("parseInline", () => {
  it("splits inline code, bold, italic and links into spans", () => {
    const spans = parseInline("use `vibe run` then **go** or *maybe* [docs](https://x)");
    const code = spans.find((s) => s.text === "vibe run");
    expect(code?.color).toBeTruthy();
    expect(spans.find((s) => s.text === "go")?.bold).toBe(true);
    expect(spans.find((s) => s.text === "maybe")?.italic).toBe(true);
    const link = spans.find((s) => s.text === "docs");
    expect(link?.underline).toBe(true);
  });

  it("keeps markup literal inside inline code", () => {
    const spans = parseInline("`**not bold**`");
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe("**not bold**");
  });

  it("returns a single empty span for empty input", () => {
    expect(parseInline("")).toEqual([{ text: "" }]);
  });
});

describe("renderMarkdown", () => {
  it("surfaces the frontmatter title as a bold heading", () => {
    const lines = renderMarkdown('---\ntitle: Hello\nslug: x\n---\n\nbody');
    expect(lines[0]![0]!.text).toBe("Hello");
    expect(lines[0]![0]!.bold).toBe(true);
  });

  it("renders headings, bullets and a fenced code block", () => {
    const md = ["# Title", "", "- one", "- two", "", "```bash", "vibe run", "```"].join("\n");
    const lines = renderMarkdown(md);
    const flat = lines.map((l) => l.map((s) => s.text).join(""));
    expect(flat).toContain("Title");
    expect(flat.some((t) => t.includes("• one"))).toBe(true);
    // code line is gutter-prefixed
    expect(flat.some((t) => t.includes("vibe run"))).toBe(true);
    expect(lines.find((l) => l.some((s) => s.text === "vibe run"))![0]!.text).toBe("│ ");
  });
});
