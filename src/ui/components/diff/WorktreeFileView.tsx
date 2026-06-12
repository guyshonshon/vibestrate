import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
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
      <div className="px-4 py-8 text-center text-[12.5px] text-fog-400">
        Select a changed file to view its contents in the run's worktree.
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-300">
        {error}
      </div>
    );
  if (!view)
    return (
      <div className="px-4 py-6 text-[12.5px] text-fog-400">Loading file…</div>
    );
  if (view.isSecretLike)
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-200">
        {view.notice ?? "Secret-like file - contents are not shown."}
      </div>
    );
  if (view.isBinary)
    return (
      <div className="px-4 py-6 text-[12.5px] text-fog-400">
        Binary file ({view.size} bytes) - no text view.
      </div>
    );

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
        <span className="mono text-[11px] text-fog-300 truncate">{view.path}</span>
        <span className="mono ml-auto shrink-0 text-[10.5px] text-fog-500">
          {view.rootLabel}
          {view.totalLines != null ? ` · ${view.totalLines} lines` : ""}
          {view.isTruncated ? " · truncated" : ""}
        </span>
      </div>
      <div className="max-h-[480px] overflow-auto bg-black/40">
        <table className="w-full border-collapse">
          <tbody>
            {view.lines.map((l) => (
              <tr key={l.number}>
                <td className="select-none border-r border-white/[0.05] px-2 py-0 text-right mono text-[11px] leading-[1.7] text-fog-500 w-[1%] whitespace-nowrap">
                  {l.number}
                </td>
                <td className="px-3 py-0 mono text-[12px] leading-[1.7] text-fog-200 whitespace-pre">
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
