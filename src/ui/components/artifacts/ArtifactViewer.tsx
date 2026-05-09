import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export function ArtifactViewer({
  runId,
  path,
}: {
  runId: string;
  path: string | null;
}) {
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
      <div className="text-[12px] text-amaco-fg-muted">
        Select an artifact to read it.
      </div>
    );
  }
  if (error) return <div className="text-[12px] text-amaco-fail">{error}</div>;
  if (content === null)
    return <div className="text-[12px] text-amaco-fg-muted">Loading…</div>;

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
    <div className="overflow-auto rounded border border-amaco-border bg-amaco-canvas">
      <header className="border-b border-amaco-border bg-amaco-panel px-3 py-1.5">
        <span className="amaco-mono text-[11.5px] text-amaco-fg-dim">{path}</span>
      </header>
      <pre className="amaco-mono whitespace-pre-wrap p-3 text-[12.5px] leading-[1.55] text-amaco-fg">
        {body}
      </pre>
    </div>
  );
}
