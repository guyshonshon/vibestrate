import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { ArtifactEntry } from "../../lib/types.js";

export function RuntimeLogPanel({ runId }: { runId: string }) {
  const [entries, setEntries] = useState<ArtifactEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [body, setBody] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api.listArtifacts(runId);
        if (cancelled) return;
        const logs = list.filter(
          (a) =>
            a.path.includes("validation/") ||
            a.path.endsWith("execution-output.md") ||
            a.path.endsWith("review.md") ||
            a.path.endsWith("verification.md") ||
            a.path.endsWith("plan.md") ||
            a.path.endsWith("architecture.md"),
        );
        setEntries(logs);
        if (!activePath && logs.length > 0) {
          setActivePath(logs[logs.length - 1]!.path);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, activePath]);

  useEffect(() => {
    if (!activePath) return;
    let cancelled = false;
    const load = async () => {
      try {
        const text = await api.readArtifact(runId, activePath);
        if (!cancelled) setBody(text);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, [runId, activePath]);

  if (error) return <div className="text-[12px] text-vibestrate-fail">{error}</div>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {entries.length === 0 ? (
          <div className="text-[12px] text-vibestrate-fg-muted">
            No runtime logs yet.
          </div>
        ) : (
          entries.map((e) => (
            <button
              key={e.path}
              onClick={() => setActivePath(e.path)}
              className={`vibestrate-mono rounded border px-1.5 py-0.5 text-[11px] ${
                activePath === e.path
                  ? "border-vibestrate-accent text-vibestrate-accent"
                  : "border-vibestrate-border text-vibestrate-fg-dim hover:text-vibestrate-fg"
              }`}
            >
              {e.path}
            </button>
          ))
        )}
      </div>
      {activePath ? (
        <pre className="vibestrate-mono max-h-72 overflow-auto whitespace-pre-wrap rounded border border-vibestrate-border bg-vibestrate-canvas p-2 text-[12px] leading-[1.55] text-vibestrate-fg">
          {body || "Empty."}
        </pre>
      ) : null}
    </div>
  );
}
