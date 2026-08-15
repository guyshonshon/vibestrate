import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Skeleton, SkeletonBlock, SkeletonText } from "../design/Skeleton.js";
import type { FileView } from "../../lib/types.js";

/**
 * Inline worktree file contents for the run screen - the path-guarded
 * `/api/runs/:runId/file` read, rendered in place so seeing what a run
 * actually wrote never requires leaving the page (new files don't exist in
 * the project root until merge, so "open in project" can't show them).
 */
export function WorktreeFileView({
  runId,
  filePath,
}: {
  runId: string;
  filePath: string | null;
}) {
  const [view, setView] = useState<FileView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setView(null);
      setError(null);
      return;
    }
    let cancelled = false;
    api
      .getRunFile({ runId, path: filePath })
      .then((f) => {
        if (!cancelled) {
          setView(f);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setView(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId, filePath]);

  if (!filePath)
    return (
      <div className="px-4 py-8 text-center text-[12.5px] text-chalk-400">
        Pick a changed file to see it.
      </div>
    );
  if (error)
    return (
      <div className="rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[12.5px] text-rose-300">
        {error}
      </div>
    );
  if (!view)
    return (
      <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)]">
        {/* The path is known from the selection; the gutter and the source are
            what is still arriving. */}
        <div className="flex items-center gap-2 border-b border-[color:var(--line-soft)] bg-coal-500/60 px-3 py-1.5">
          <span className="mono truncate text-meta text-chalk-300">{filePath}</span>
        </div>
        <Skeleton label="Loading the file" className="flex bg-coal-700">
          <div className="flex flex-col gap-[7px] border-r border-[color:var(--line-soft)] px-2 py-2">
            {Array.from({ length: 14 }, (_, i) => (
              <SkeletonBlock key={i} tone="text" h={9} w={16} />
            ))}
          </div>
          <div className="min-w-0 flex-1 px-3 py-2">
            <SkeletonText lines={14} size={9} gap={7} />
          </div>
        </Skeleton>
      </div>
    );
  if (view.isSecretLike)
    return (
      <div className="rounded-[12px] border border-amber-soft/30 bg-amber-soft/10 px-4 py-2.5 text-[12.5px] text-amber-soft">
        {view.notice ?? "Secret-like file - contents are not shown."}
      </div>
    );
  if (view.isBinary)
    return (
      <div className="px-4 py-6 text-[12.5px] text-chalk-400">
        Binary file ({view.size} bytes) - no text view.
      </div>
    );

  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)]">
      <div className="flex items-center gap-2 border-b border-[color:var(--line-soft)] bg-coal-500/60 px-3 py-1.5">
        <span className="mono truncate text-meta text-chalk-300">{view.path}</span>
        <span className="mono ml-auto shrink-0 text-meta text-chalk-400">
          {view.rootLabel}
          {view.totalLines != null ? ` · ${view.totalLines} lines` : ""}
          {view.isTruncated ? " · truncated" : ""}
        </span>
      </div>
      <div className="max-h-[480px] overflow-auto bg-coal-700">
        <table className="w-full border-collapse">
          <tbody>
            {view.lines.map((l) => (
              <tr key={l.number}>
                <td className="mono w-[1%] select-none whitespace-nowrap border-r border-[color:var(--line-soft)] px-2 py-0 text-right text-meta leading-[1.7] text-chalk-400">
                  {l.number}
                </td>
                <td className="mono whitespace-pre px-3 py-0 text-[12px] leading-[1.7] text-chalk-200">
                  {l.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
