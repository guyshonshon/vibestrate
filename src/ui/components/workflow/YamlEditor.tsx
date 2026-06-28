import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// A CodeMirror 6 YAML editor for the Flow Builder's code view: real syntax
// highlighting, line numbers, and bracket matching instead of a bare textarea.
// The server is still the gate (raw-YAML saves go through importFlow); this is
// purely the editing surface.

// Editor chrome - transparent ground (the card shows through), the mono stack,
// a violet caret/selection. Colors are theme tokens (CSS vars) so they flip with
// the app: the YAML panel background (coal-900) is dark in dark mode and light
// in light mode, so hardcoded ink would be unreadable in one of them.
const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      fontSize: "11.5px",
      color: "var(--color-chalk-100)",
    },
    ".cm-content": {
      fontFamily:
        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
      caretColor: "var(--color-violet-soft)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--color-chalk-400)",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor:
        "color-mix(in srgb, var(--color-violet-soft) 8%, transparent)",
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor:
          "color-mix(in srgb, var(--color-violet-soft) 28%, transparent)",
      },
    ".cm-cursor": { borderLeftColor: "var(--color-violet-soft)" },
  },
  { dark: true },
);

// Syntax colors mapped to the dashboard palette. CodeMirror's default
// highlighter renders YAML keys (definition(propertyName)) in a dark blue that
// is unreadable on the coal ground; this overrides every token @lezer/yaml
// emits with a readable, theme-aware colour:
//   keys -> violet,  strings -> emerald,  scalars -> chalk,
//   numbers/booleans/tags -> amber,  anchors -> sky,  comments -> muted.
const highlight = HighlightStyle.define([
  {
    tag: [t.definition(t.propertyName), t.propertyName],
    color: "var(--color-violet-soft)",
    fontWeight: "600",
  },
  {
    tag: [t.string, t.special(t.string), t.attributeValue],
    color: "var(--color-emerald)",
  },
  { tag: [t.content, t.literal], color: "var(--color-chalk-100)" },
  {
    tag: [t.number, t.bool, t.null, t.atom, t.keyword, t.typeName],
    color: "var(--color-amber-soft)",
  },
  { tag: [t.labelName], color: "var(--color-sky-glow)" },
  {
    tag: [t.lineComment, t.comment],
    color: "var(--color-chalk-400)",
    fontStyle: "italic",
  },
  {
    tag: [t.punctuation, t.separator, t.brace, t.squareBracket, t.meta],
    color: "var(--color-chalk-400)",
  },
]);

export function YamlEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      editable={!readOnly}
      readOnly={readOnly}
      theme={theme}
      extensions={[yaml(), syntaxHighlighting(highlight), EditorView.lineWrapping]}
      minHeight="240px"
      maxHeight="600px"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        autocompletion: false,
      }}
    />
  );
}
