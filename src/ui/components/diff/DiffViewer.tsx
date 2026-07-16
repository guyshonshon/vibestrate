import { useEffect, useState } from "react";
import { Copy, ExternalLink, FolderOpen, GitBranch } from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type { FileDiff } from "../../lib/types.js";
import { SecretDiffWarning } from "./SecretDiffWarning.js";

type Line = { kind: "context" | "add" | "del" | "hunk" | "header"; text: string };

function classifyLine(line: string): Line {
  if (line.startsWith("@@")) return { kind: "hunk", text: line };
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git"))
    return { kind: "header", text: line };
  if (line.startsWith("+")) return { kind: "add", text: line };
  if (line.startsWith("-")) return { kind: "del", text: line };
  return { kind: "context", text: line };
}

type Props = {
  runId: string;
  filePath: string | null;
  onOpenInProject?: (path: string) => void;
  onOpenInWorktree?: (path: string) => void;
};

export function DiffViewer({
  runId,
  filePath,
  onOpenInProject,
  onOpenInWorktree,
}: Props) {
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setDiff(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const fd = await api.getFileDiff(runId, filePath);
        if (!cancelled) {
          setDiff(fd);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, [runId, filePath]);

  if (!filePath) {
    return (
      <div className="text-[12px] text-chalk-400">
        Select a file to see its diff.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[12px] text-rose-300">
        {error}
      </div>
    );
  }

  if (!diff) {
    return <div className="text-[12px] text-chalk-400">Loading diff…</div>;
  }

  if (diff.redacted) {
    return <SecretDiffWarning message={diff.redactionReason} />;
  }

  const lines = diff.body.split("\n").map(classifyLine);

  return (
    <div className="overflow-auto rounded-[18px] border border-[color:var(--line)] bg-coal-600">
      <header className="flex items-center gap-1.5 border-b border-[color:var(--line-soft)] bg-coal-500/60 px-3 py-1.5 text-[11.5px] text-chalk-300">
        <span className="mono truncate">{diff.path}</span>
        <div className="ml-auto flex items-center gap-1">
          {onOpenInProject ? (
            <button
              type="button"
              onClick={() => onOpenInProject(diff.path)}
              className="inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11px] font-semibold text-chalk-300 transition hover:bg-coal-400 hover:text-chalk-100"
              title="Open this file in the project codebase view"
            >
              <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
              project
            </button>
          ) : null}
          {onOpenInWorktree ? (
            <button
              type="button"
              onClick={() => onOpenInWorktree(diff.path)}
              className="inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11px] font-semibold text-chalk-300 transition hover:bg-coal-400 hover:text-chalk-100"
              title="Open this file in the run's worktree"
            >
              <GitBranch className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
              worktree
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(diff.path).catch(() => {});
            }}
            className="inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11px] font-semibold text-chalk-300 transition hover:bg-coal-400 hover:text-chalk-100"
            title="Copy path"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
            copy
          </button>
          <button
            type="button"
            onClick={() => {
              void api
                .openInEditor({ path: diff.path, runId })
                .catch((err) => {
                  if (err instanceof ApiError && err.status === 409) {
                    // Editor not configured - silent. The file viewer surfaces the same hint.
                  }
                });
            }}
            className="inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11px] font-semibold text-chalk-300 transition hover:bg-coal-400 hover:text-chalk-100"
            title="Open in editor (if configured)"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
            editor
          </button>
        </div>
      </header>
      <pre className="mono whitespace-pre p-3 text-[12.5px] leading-[1.55]">
        {lines.map((line, i) => {
          let cls = "text-chalk-300";
          if (line.kind === "add") cls = "text-emerald bg-emerald/10";
          else if (line.kind === "del") cls = "text-rose-300 bg-rose-500/10";
          else if (line.kind === "hunk") cls = "text-violet-soft";
          else if (line.kind === "header") cls = "text-chalk-400";
          return (
            <span key={i} className={`block px-2 ${cls}`}>
              {line.text || " "}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
