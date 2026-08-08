import { useEffect, useState } from "react";
import { Copy, ExternalLink, FolderOpen, GitBranch } from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type { FileDiff } from "../../lib/types.js";
import { Button } from "../design/Button.js";
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenInProject(diff.path)}
              iconLeft={<FolderOpen className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />}
              title="Open this file in the project codebase view"
            >
              project
            </Button>
          ) : null}
          {onOpenInWorktree ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenInWorktree(diff.path)}
              iconLeft={<GitBranch className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />}
              title="Open this file in the run's worktree"
            >
              worktree
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Safe to degrade silently: a blocked clipboard leaves the path
              // visible right here to select by hand. Nothing is misread as
              // absent - this reads no data and asserts nothing.
              void navigator.clipboard.writeText(diff.path).catch(() => {});
            }}
            iconLeft={<Copy className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />}
            title="Copy path"
          >
            copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void api
                .openInEditor({ path: diff.path, runId })
                .catch((err) => {
                  if (err instanceof ApiError && err.status === 409) {
                    // Editor not configured - silent. The file viewer surfaces the same hint.
                  }
                });
            }}
            iconLeft={<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />}
            title="Open in editor (if configured)"
          >
            editor
          </Button>
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
