import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { ArtifactEntry } from "../../lib/types.js";

export function ArtifactList({
  runId,
  selectedPath,
  onSelect,
}: {
  runId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [items, setItems] = useState<ArtifactEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api.listArtifacts(runId);
        if (!cancelled) {
          setItems(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId]);

  if (error)
    return <div className="text-[12px] text-vibestrate-fail">{error}</div>;

  if (items.length === 0) {
    return (
      <div className="text-[12px] text-vibestrate-fg-muted">
        No artifacts yet.
      </div>
    );
  }

  return (
    <ol className="space-y-px">
      {items.map((entry) => (
        <li key={entry.path}>
          <button
            onClick={() => onSelect(entry.path)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-vibestrate-panel-2 ${
              selectedPath === entry.path ? "bg-vibestrate-panel-2" : ""
            }`}
          >
            <span className="vibestrate-mono flex-1 truncate text-[12px] text-vibestrate-fg">
              {entry.path}
            </span>
            <span className="vibestrate-mono text-[11px] text-vibestrate-fg-muted">
              {entry.size}b
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
