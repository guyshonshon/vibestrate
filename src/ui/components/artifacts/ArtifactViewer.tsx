import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { CodeReferenceText } from "../codebase/CodeReferenceText.js";
import type { CodeReference } from "../../lib/types.js";

type Props = {
  runId: string;
  path: string | null;
  onOpenReference?: (ref: CodeReference) => void;
};

export function ArtifactViewer({ runId, path, onOpenReference }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setContent(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const text = await api.readArtifact(runId, path);
        if (!cancelled) {
          setContent(text);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, [runId, path]);

  if (!path) {
    return (
      <div className="text-[12px] text-vibestrate-fg-muted">
        Select an artifact to read it.
      </div>
    );
  }
  if (error) return <div className="text-[12px] text-vibestrate-fail">{error}</div>;
  if (content === null)
    return <div className="text-[12px] text-vibestrate-fg-muted">Loading…</div>;

  // Pretty-print JSON for readability while keeping the original text in the
  // raw `content` state. The reference parser runs against the prettified
  // text so line numbers users see still match the references they click.
  let body: string;
  if (path.endsWith(".json")) {
    try {
      body = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      body = content;
    }
  } else {
    body = content;
  }

  return (
    <div className="overflow-auto rounded border border-vibestrate-border bg-vibestrate-canvas">
      <header className="border-b border-vibestrate-border bg-vibestrate-panel px-3 py-1.5">
        <span className="vibestrate-mono text-[11.5px] text-vibestrate-fg-dim">{path}</span>
      </header>
      <pre className="vibestrate-mono whitespace-pre-wrap p-3 text-[12.5px] leading-[1.55] text-vibestrate-fg">
        <CodeReferenceText
          text={body}
          runId={runId}
          onOpenReference={(ref) => {
            if (onOpenReference) onOpenReference(ref);
          }}
        />
      </pre>
    </div>
  );
}
