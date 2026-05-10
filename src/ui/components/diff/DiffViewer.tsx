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
      <div className="text-[12px] text-amaco-fg-muted">
        Select a file to see its diff.
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-[12px] text-amaco-fail">{error}</div>
    );
  }

  if (!diff) {
    return <div className="text-[12px] text-amaco-fg-muted">Loading diff…</div>;
  }

  if (diff.redacted) {
    return <SecretDiffWarning message={diff.redactionReason} />;
  }

  const lines = diff.body.split("\n").map(classifyLine);

  return (
    <div className="overflow-auto rounded border border-amaco-border bg-amaco-canvas">
      <header className="flex items-center gap-1.5 border-b border-amaco-border bg-amaco-panel px-3 py-1.5 text-[11.5px] text-amaco-fg-dim">
        <span className="amaco-mono truncate">{diff.path}</span>
        <div className="ml-auto flex items-center gap-1">
          {onOpenInProject ? (
            <button
              type="button"
              onClick={() => onOpenInProject(diff.path)}
              className="inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel-2"
              title="Open this file in the project codebase view"
            >
              <FolderOpen className="h-3 w-3" strokeWidth={1.5} />
              project
            </button>
          ) : null}
          {onOpenInWorktree ? (
            <button
              type="button"
              onClick={() => onOpenInWorktree(diff.path)}
              className="inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel-2"
              title="Open this file in the run's worktree"
            >
              <GitBranch className="h-3 w-3" strokeWidth={1.5} />
              worktree
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(diff.path).catch(() => {});
            }}
            className="inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel-2"
            title="Copy path"
          >
            <Copy className="h-3 w-3" strokeWidth={1.5} />
            copy
          </button>
          <button
            type="button"
            onClick={() => {
              void api
                .openInEditor({ path: diff.path, runId })
                .catch((err) => {
                  if (err instanceof ApiError && err.status === 409) {
                    // Editor not configured — silent. The file viewer surfaces the same hint.
                  }
                });
            }}
            className="inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel-2"
            title="Open in editor (if configured)"
          >
            <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
            editor
          </button>
        </div>
      </header>
      <pre className="amaco-mono whitespace-pre p-3 text-[12.5px] leading-[1.55]">
        {lines.map((line, i) => {
          let cls = "text-amaco-fg-dim";
          if (line.kind === "add")
            cls = "text-amaco-diff-add-fg bg-amaco-diff-add/40";
          else if (line.kind === "del")
            cls = "text-amaco-diff-del-fg bg-amaco-diff-del/40";
          else if (line.kind === "hunk") cls = "text-amaco-accent";
          else if (line.kind === "header") cls = "text-amaco-fg-muted";
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
