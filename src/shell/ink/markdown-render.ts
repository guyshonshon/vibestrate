// A tiny, dependency-free Markdown → styled-span renderer for the terminal
// docs browser. Pure (import-free except the color ramp) so it's unit-tested;
// the DocsOverlay maps the spans onto Ink <Text>. Not a full CommonMark
// implementation — it covers the constructs our docs use: frontmatter,
// headings, fenced code, lists, blockquotes, rules, and inline
// code/bold/italic/links.
import { ACCENT, ACCENT_BRIGHT, ACCENT_DIM } from "./theme.js";

export type MdSpan = {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
};
export type MdLine = MdSpan[];

const CODE_COLOR = "#7ee787"; // soft green for code
const LINK_COLOR = ACCENT;

/** Inline parse: `code`, **bold**, *italic* / _italic_, [text](url). */
export function parseInline(text: string): MdSpan[] {
  const spans: MdSpan[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      spans.push({ text: buf });
      buf = "";
    }
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    // inline code — wins over everything so `**x**` inside it stays literal
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        spans.push({ text: text.slice(i + 1, end), color: CODE_COLOR });
        i = end + 1;
        continue;
      }
    }
    let m = /^\[([^\]]+)\]\(([^)]+)\)/.exec(rest);
    if (m) {
      flush();
      spans.push({ text: m[1]!, color: LINK_COLOR, underline: true });
      i += m[0].length;
      continue;
    }
    m = /^\*\*([^*]+)\*\*/.exec(rest);
    if (m) {
      flush();
      spans.push({ text: m[1]!, bold: true });
      i += m[0].length;
      continue;
    }
    m = /^(?:\*([^*]+)\*|_([^_]+)_)/.exec(rest);
    if (m) {
      flush();
      spans.push({ text: (m[1] ?? m[2])!, italic: true });
      i += m[0].length;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return spans.length > 0 ? spans : [{ text: "" }];
}

export function renderMarkdown(md: string): MdLine[] {
  const out: MdLine[] = [];
  let lines = md.replace(/\r\n/g, "\n").split("\n");

  // Strip YAML frontmatter, surfacing its `title:` as an H1.
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      const fm = lines.slice(1, end);
      const titleLine = fm.find((l) => /^title:/i.test(l.trim()));
      lines = lines.slice(end + 1);
      if (titleLine) {
        const title = titleLine.replace(/^title:\s*/i, "").replace(/^["']|["']$/g, "");
        out.push([{ text: title, color: ACCENT_BRIGHT, bold: true }]);
        out.push([{ text: "" }]);
      }
    }
  }

  let inFence = false;
  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      const lang = trimmed.slice(3).trim();
      out.push([{ text: lang ? `╶ ${lang}` : "╶", color: ACCENT_DIM }]);
      continue;
    }
    if (inFence) {
      out.push([
        { text: "│ ", color: ACCENT_DIM },
        { text: line, color: CODE_COLOR },
      ]);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1]!.length;
      const color = level === 1 ? ACCENT_BRIGHT : ACCENT;
      out.push([{ text: heading[2]!, color, bold: true }]);
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      out.push([{ text: "─".repeat(24), color: ACCENT_DIM }]);
      continue;
    }

    if (trimmed.startsWith(">")) {
      out.push([
        { text: "▏ ", color: ACCENT_DIM },
        ...parseInline(trimmed.replace(/^>\s?/, "")).map((s) => ({
          ...s,
          dim: true,
          italic: true,
        })),
      ]);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      out.push([{ text: "  • ", color: ACCENT }, ...parseInline(bullet[1]!)]);
      continue;
    }
    const numbered = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (numbered) {
      out.push([
        { text: `  ${numbered[1]}. `, color: ACCENT },
        ...parseInline(numbered[2]!),
      ]);
      continue;
    }

    if (trimmed === "") {
      out.push([{ text: "" }]);
      continue;
    }
    out.push(parseInline(line));
  }
  return out;
}
