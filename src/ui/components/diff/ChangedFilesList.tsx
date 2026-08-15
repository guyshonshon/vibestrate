import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ChangedFile, DiffSnapshot } from "../../lib/types.js";
import { StatTile } from "../design/StatTile.js";
import { Skeleton, SkeletonBlock, SkeletonStats } from "../design/Skeleton.js";

// Tone per git status word. FilesSection.tsx mirrors this six-way mapping
// for the same statuses - keep new statuses colored in both places.
const STATUS_COLORS: Record<ChangedFile["status"], string> = {
  added: "text-emerald-400",
  modified: "text-violet-soft",
  deleted: "text-rose-300",
  renamed: "text-amber-soft",
  untracked: "text-chalk-300",
  unknown: "text-chalk-300",
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
      <span className="text-[12.5px] font-semibold text-chalk-100">
        Changed files
      </span>
      {snapshot ? (
        <div className="mt-2 flex flex-wrap items-stretch gap-1">
          <StatTile value={snapshot.totals.files} label="files" />
          <StatTile
            value={`+${snapshot.totals.insertions}`}
            label="added"
            tone="emerald"
          />
          <StatTile
            value={`-${snapshot.totals.deletions}`}
            label="removed"
            tone="rose"
          />
          {snapshot.totals.redactedFiles > 0 ? (
            <StatTile
              value={snapshot.totals.redactedFiles}
              label="redacted"
              tone="amber"
            />
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="mt-2 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[12px] text-rose-300">
          {error}
        </div>
      ) : snapshot === null ? (
        // A missing snapshot is the diff request still open, not a worktree
        // that does not exist; a failed read lands on the error branch above.
        <Skeleton label="Loading changed files" className="mt-2">
          <SkeletonStats count={3} className="mb-2" />
          <div className="flex flex-col gap-px">
            {[0, 1, 2, 3, 4].map((r) => (
              <div key={r} className="flex items-center gap-2 px-3 py-2">
                <SkeletonBlock w={10} h={10} radius={3} />
                <SkeletonBlock tone="text" h={12} w={`${[72, 54, 84, 46, 66][r]}%`} />
                <SkeletonBlock tone="text" h={10} w={56} className="ml-auto" />
              </div>
            ))}
          </div>
        </Skeleton>
      ) : snapshot.files.length === 0 ? (
        <div className="mt-2 text-[12px] text-chalk-300">
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
                  className={`mono w-4 text-meta ${STATUS_COLORS[f.status]}`}
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
                <span className="mono num-tabular text-meta text-chalk-300">
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
