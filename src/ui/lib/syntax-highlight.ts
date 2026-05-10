import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

let registered = false;

function ensureRegistered(): void {
  if (registered) return;
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("c", c);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("graphql", graphql);
  hljs.registerLanguage("ini", ini);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("kotlin", kotlin);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("ruby", ruby);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("scss", scss);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("swift", swift);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("yaml", yaml);
  registered = true;
}

/**
 * Map our internal language names (returned by file-view-service) to the
 * highlight.js grammar that produces the best result. Anything we don't
 * recognise falls through to plaintext.
 */
function pickGrammar(language: string): string | null {
  switch (language) {
    case "typescript":
    case "tsx":
      return "typescript";
    case "javascript":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "markdown":
    case "mdx":
      return "markdown";
    case "yaml":
      return "yaml";
    case "toml":
      // highlight.js doesn't ship a real TOML grammar; ini is a close-enough
      // visual approximation (key/value/section).
      return "ini";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "html":
      return "xml";
    case "bash":
      return "bash";
    case "python":
      return "python";
    case "ruby":
      return "ruby";
    case "go":
      return "go";
    case "rust":
      return "rust";
    case "java":
      return "java";
    case "c":
      return "c";
    case "cpp":
      return "cpp";
    case "kotlin":
      return "kotlin";
    case "swift":
      return "swift";
    case "sql":
      return "sql";
    case "graphql":
      return "graphql";
    case "diff":
      return "diff";
    default:
      return null;
  }
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

/**
 * Highlight a block of code and return one string of HTML per source line.
 *
 * highlight.js can return spans that cross newlines (for example a
 * multi-line string literal). Returning HTML per line — to pair with line
 * numbers — requires re-balancing those spans at every newline. The
 * algorithm is the classic "close stack at \n, re-open on the next line":
 *
 *   1. Walk the highlighted HTML token-by-token (open tag, close tag,
 *      newline, raw text).
 *   2. Maintain a stack of open `<span>` tags.
 *   3. At every newline, append the closing tags (innermost first) to the
 *      current line, push it, start a fresh line, re-open every tag still
 *      on the stack.
 *
 * Falls back to plain HTML-escaped text when the language is not registered.
 */
export function highlightLines(text: string, language: string): string[] {
  ensureRegistered();
  const grammar = pickGrammar(language);
  if (!grammar) {
    // No grammar — escape and split.
    return text.split("\n").map(escapeHtml);
  }
  let html: string;
  try {
    html = hljs.highlight(text, { language: grammar, ignoreIllegals: true }).value;
  } catch {
    return text.split("\n").map(escapeHtml);
  }
  return splitHighlightedHtmlByLine(html);
}

/**
 * Walk the highlight.js output and produce one balanced HTML string per
 * source line. Spans that span a newline are closed at the newline and
 * re-opened on the next line.
 *
 * highlight.js v11 only emits `<span class="...">...</span>` constructs in
 * its output, so we only need to recognise those. Any literal `<` / `>` in
 * the source has already been HTML-escaped by the highlighter.
 */
export function splitHighlightedHtmlByLine(html: string): string[] {
  const tokens: { kind: "open" | "close" | "text" | "newline"; value: string }[] = [];
  // Token regex: a span open tag, a close tag, a newline, or a chunk of text
  // that doesn't contain any of those.
  const re = /<span class="[^"]*">|<\/span>|\n|[^<\n]+|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const piece = m[0];
    if (piece === "\n") tokens.push({ kind: "newline", value: piece });
    else if (piece.startsWith("</span")) tokens.push({ kind: "close", value: piece });
    else if (piece.startsWith("<span")) tokens.push({ kind: "open", value: piece });
    else tokens.push({ kind: "text", value: piece });
  }

  const lines: string[] = [];
  let current = "";
  const stack: string[] = [];

  for (const token of tokens) {
    if (token.kind === "open") {
      stack.push(token.value);
      current += token.value;
    } else if (token.kind === "close") {
      stack.pop();
      current += token.value;
    } else if (token.kind === "newline") {
      // Close every open tag in reverse order, push the line, then re-open
      // them at the start of the next line.
      for (let i = stack.length - 1; i >= 0; i--) current += "</span>";
      lines.push(current);
      current = stack.join("");
    } else {
      current += token.value;
    }
  }
  // Flush the trailing partial line.
  for (let i = stack.length - 1; i >= 0; i--) current += "</span>";
  lines.push(current);
  return lines;
}
