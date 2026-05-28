import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ChangedFile, DiffSnapshot } from "../../lib/types.js";

const STATUS_COLORS: Record<ChangedFile["status"], string> = {
  added: "text-vibestrate-success",
  modified: "text-vibestrate-accent",
  deleted: "text-vibestrate-fail",
  renamed: "text-vibestrate-warn",
  untracked: "text-vibestrate-fg-dim",
  unknown: "text-vibestrate-fg-muted",
};

const STATUS_GLYPH: Record<ChangedFile["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
  unknown: " ",
};

export function ChangedFilesList({
  runId,
  selectedPath,
  onSelect,
}: {
  runId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<DiffSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await api.getDiff(runId);
        if (!cancelled) {
          setSnapshot(snap);
          setError(null);
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
  }, [runId]);

  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        <span>changed files</span>
        {snapshot ? (
          <span className="vibestrate-mono normal-case tracking-normal">
            {snapshot.totals.files} · +{snapshot.totals.insertions} −{snapshot.totals.deletions}
            {snapshot.totals.redactedFiles > 0
              ? ` · ${snapshot.totals.redactedFiles} redacted`
              : ""}
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-2 text-[12px] text-vibestrate-fail">{error}</div>
      ) : snapshot === null ? (
        <div className="mt-2 text-[12px] text-vibestrate-fg-muted">
          Worktree not available yet.
        </div>
      ) : snapshot.files.length === 0 ? (
        <div className="mt-2 text-[12px] text-vibestrate-fg-muted">
          No changes detected.
        </div>
      ) : (
        <ol className="mt-2 space-y-px">
          {snapshot.files.map((f) => (
            <li key={f.path}>
              <button
                onClick={() => onSelect(f.path)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-vibestrate-panel-2 ${
                  selectedPath === f.path ? "bg-vibestrate-panel-2" : ""
                }`}
              >
                <span
                  className={`vibestrate-mono w-4 text-[11px] ${STATUS_COLORS[f.status]}`}
                >
                  {STATUS_GLYPH[f.status]}
                </span>
                <span className="vibestrate-mono flex-1 truncate text-[12px] text-vibestrate-fg">
                  {f.path}
                </span>
                {f.isSecretLike ? (
                  <Lock
                    className="h-3 w-3 text-vibestrate-warn"
                    strokeWidth={1.5}
                  />
                ) : null}
                <span className="vibestrate-mono text-[11px] text-vibestrate-fg-muted">
                  +{f.insertions} −{f.deletions}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
