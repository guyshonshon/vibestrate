import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ChangedFile, DiffSnapshot } from "../../lib/types.js";

const STATUS_COLORS: Record<ChangedFile["status"], string> = {
  added: "text-emerald-400",
  modified: "text-violet-soft",
  deleted: "text-rose-300",
  renamed: "text-amber-soft",
  untracked: "text-chalk-300",
  unknown: "text-chalk-400",
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
      <div className="flex items-center justify-between text-[12.5px] font-semibold text-chalk-100">
        <span>Changed files</span>
        {snapshot ? (
          <span className="mono text-[11.5px] text-chalk-300">
            {snapshot.totals.files}{" "}
            <span className="text-emerald-400">+{snapshot.totals.insertions}</span>{" "}
            <span className="text-rose-300">-{snapshot.totals.deletions}</span>
            {snapshot.totals.redactedFiles > 0 ? (
              <span className="text-amber-soft">
                {" "}
                {snapshot.totals.redactedFiles} redacted
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[12px] text-rose-300">
          {error}
        </div>
      ) : snapshot === null ? (
        <div className="mt-2 text-[12px] text-chalk-400">
          Worktree not available yet.
        </div>
      ) : snapshot.files.length === 0 ? (
        <div className="mt-2 text-[12px] text-chalk-400">
          No changes detected.
        </div>
      ) : (
        <ol className="mt-2 space-y-px">
          {snapshot.files.map((f) => (
            <li key={f.path}>
              <button
                onClick={() => onSelect(f.path)}
                className={`flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left transition hover:bg-coal-400 ${
                  selectedPath === f.path ? "bg-coal-500/60" : ""
                }`}
              >
                <span
                  className={`mono w-4 text-[11px] ${STATUS_COLORS[f.status]}`}
                >
                  {STATUS_GLYPH[f.status]}
                </span>
                <span className="mono flex-1 truncate text-[12px] text-chalk-100">
                  {f.path}
                </span>
                {f.isSecretLike ? (
                  <Lock
                    className="h-3.5 w-3.5 text-amber-soft"
                    strokeWidth={1.9}
                    aria-hidden
                  />
                ) : null}
                <span className="mono text-[11px] text-chalk-300">
                  <span className="text-emerald-400">+{f.insertions}</span>{" "}
                  <span className="text-rose-300">-{f.deletions}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
