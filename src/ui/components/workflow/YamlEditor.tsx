import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";

// A CodeMirror 6 YAML editor for the Flow Builder's code view: real syntax
// highlighting, line numbers, and bracket matching instead of a bare textarea.
// The server is still the gate (raw-YAML saves go through importFlow); this is
// purely the editing surface.

// Match the dashboard's flat dark surface: transparent ground (the slab shows
// through), the mono stack, and a violet caret/selection. Syntax colors come
// from CodeMirror's default highlighter, which reads fine on the dark ground.
const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      fontSize: "11.5px",
      color: "var(--color-fog-100, #e7e7ea)",
    },
    ".cm-content": {
      fontFamily:
        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
      caretColor: "#a78bfa",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--color-fog-500, #6b6b76)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgba(167,139,250,0.06)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "rgba(167,139,250,0.25)" },
    ".cm-cursor": { borderLeftColor: "#a78bfa" },
  },
  { dark: true },
);

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
      extensions={[yaml(), EditorView.lineWrapping]}
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
