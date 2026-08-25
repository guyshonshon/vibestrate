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

describe("images in the packaged docs", () => {
  // docs/content ships in the tarball and this renderer is what the in-shell
  // browser uses. The docs gained 39 image references whose PNGs live in the
  // website's repo, and without an image case the `!` fell through to the
  // buffer and the LINK case matched: a 60-word alt text rendered as an
  // underlined hyperlink to a file no terminal can open. Every gate was green.
  it("renders an image as its alt text, not as a link", () => {
    const spans = parseInline("![The Default crew card, with 6 roles.](/media/docs/scoped/crew-card.png)");
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe("[screenshot] The Default crew card, with 6 roles.");
    expect(spans[0]!.underline).toBeUndefined();
    expect(spans.some((s) => s.text.includes("/media/"))).toBe(false);
    expect(spans.some((s) => s.text.includes("!"))).toBe(false);
  });

  it("still renders a real link as a link", () => {
    const spans = parseInline("see [the flow page](/docs/concepts/flow) for more");
    const link = spans.find((s) => s.underline);
    expect(link?.text).toBe("the flow page");
  });

  it("renders an image with no alt as an empty line, not a stray bracket", () => {
    // parseInline guarantees at least one span so a line always renders, so
    // the assertion is about what is NOT there.
    const spans = parseInline("![](/media/docs/x.png)");
    expect(spans.map((s) => s.text).join("")).toBe("");
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

  it("shows an svg diagram as its aria-label, never as raw markup", () => {
    const md = [
      "before",
      "",
      '<svg viewBox="0 0 560 92" width="100%" role="img" aria-label="A flag beats a stored value.">',
      '  <rect x="1" y="26" width="150" height="40" rx="8"/>',
      '  <text x="76" y="51">--param flag</text>',
      "</svg>",
      "",
      "after",
    ].join("\n");
    const flat = renderMarkdown(md).map((l) => l.map((s) => s.text).join(""));
    expect(flat).toContain("A flag beats a stored value.");
    expect(flat.some((t) => t.includes("<"))).toBe(false);
    // the prose either side is untouched
    expect(flat).toContain("before");
    expect(flat).toContain("after");
  });

  it("keeps the text inside a docs html block and drops the tags", () => {
    const md = '<div class="docs-chips"><span>string</span><span>number</span></div>';
    const flat = renderMarkdown(md).map((l) => l.map((s) => s.text).join(""));
    expect(flat.join(" ")).toContain("string number");
    expect(flat.some((t) => t.includes("docs-chips"))).toBe(false);
  });

  it("leaves markup literal when it is the example inside a fence", () => {
    const md = ["```html", '<svg role="img" aria-label="x">', "```"].join("\n");
    const flat = renderMarkdown(md).map((l) => l.map((s) => s.text).join(""));
    expect(flat.some((t) => t.includes("<svg"))).toBe(true);
  });
});
