import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { CodeReference } from "../../lib/types.js";

type Props = {
  text: string;
  runId?: string | null;
  onOpenReference: (ref: CodeReference) => void;
  /** When true, render plain whitespace-preserving text. Default true. */
  preserveWhitespace?: boolean;
};

/**
 * Renders text with file/line references promoted to clickable buttons.
 *
 * The component never mutates the original text — it inserts <button> spans
 * over the matched ranges and leaves everything else verbatim. Refs that do
 * not exist on disk render as a dim hint; refs that exist render in the
 * accent colour.
 */
export function CodeReferenceText({
  text,
  runId,
  onOpenReference,
  preserveWhitespace = true,
}: Props) {
  const [refs, setRefs] = useState<CodeReference[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!text) {
      setRefs([]);
      return;
    }
    void api
      .parseCodeReferences({ text, runId })
      .then((r) => {
        if (!cancelled) setRefs(r);
      })
      .catch(() => {
        if (!cancelled) setRefs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [text, runId]);

  if (refs === null) {
    return (
      <span
        className={preserveWhitespace ? "amaco-mono whitespace-pre-wrap" : ""}
      >
        {text}
      </span>
    );
  }

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  refs.forEach((r, i) => {
    if (r.startIndex > cursor) {
      segments.push(text.slice(cursor, r.startIndex));
    }
    const exists = r.existsInProject || r.existsInWorktree;
    segments.push(
      <button
        key={`${i}-${r.startIndex}`}
        type="button"
        onClick={() => onOpenReference(r)}
        className={`amaco-mono inline rounded px-0.5 ${
          exists
            ? "text-amaco-accent hover:underline"
            : "text-amaco-fg-muted line-through decoration-amaco-fg-muted/40"
        }`}
        title={
          exists
            ? "Open in Codebase"
            : "Reference not found in project or worktree"
        }
      >
        {r.raw}
      </button>,
    );
    cursor = r.endIndex;
  });
  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return (
    <span
      className={
        preserveWhitespace ? "amaco-mono whitespace-pre-wrap leading-[1.55]" : ""
      }
    >
      {segments}
    </span>
  );
}
