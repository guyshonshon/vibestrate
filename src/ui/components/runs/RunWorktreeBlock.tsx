import { useEffect, useState } from "react";
import { Copy, FolderTree, GitBranch, GitCommit } from "lucide-react";
import { api } from "../../lib/api.js";
import type { GitStatus } from "../../lib/types.js";

type Props = {
  runId: string;
  worktreePath: string | null;
  branchName: string | null;
  taskId: string | null;
  onOpenCodebase: () => void;
  onOpenGit: () => void;
  onOpenTask: (taskId: string) => void;
};

export function RunWorktreeBlock({
  runId,
  worktreePath,
  branchName,
  taskId,
  onOpenCodebase,
  onOpenGit,
  onOpenTask,
}: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    if (!worktreePath) return;
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api.getRunGitStatus(runId);
        if (!cancelled) setStatus(s);
      } catch {
        // ignore — worktree may already be cleaned up
      }
    };
    void load();
    const i = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [runId, worktreePath]);

  if (!worktreePath) return null;

  return (
    <div className="rounded border border-vibestrate-border bg-vibestrate-panel/30 p-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="vibestrate-mono inline-flex items-center gap-1 rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px]">
          <GitBranch className="h-3 w-3" strokeWidth={1.5} />
          {branchName ?? "(no branch)"}
        </span>
        {status?.upstream ? (
          <span className="vibestrate-mono rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-muted">
            ↑{status.ahead ?? 0} ↓{status.behind ?? 0} {status.upstream}
          </span>
        ) : null}
        {status ? (
          <span
            className={`vibestrate-mono rounded border px-1.5 py-0.5 text-[10.5px] ${
              status.isDirty
                ? "border-vibestrate-warn/40 text-vibestrate-warn"
                : "border-vibestrate-success/40 text-vibestrate-success"
            }`}
          >
            {status.isDirty ? `dirty (${status.changedFiles.length})` : "clean"}
          </span>
        ) : null}
        {status?.headHash ? (
          <span className="vibestrate-mono inline-flex items-center gap-1 text-[10.5px] text-vibestrate-fg-muted">
            <GitCommit className="h-3 w-3" strokeWidth={1.5} />
            {status.headHash} · {status.headSubject}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenCodebase}
            className="inline-flex items-center gap-1 rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:bg-vibestrate-panel-2"
            title="Browse this worktree"
          >
            <FolderTree className="h-3 w-3" strokeWidth={1.5} />
            Codebase
          </button>
          <button
            type="button"
            onClick={onOpenGit}
            className="inline-flex items-center gap-1 rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:bg-vibestrate-panel-2"
            title="Run git status & history"
          >
            <GitCommit className="h-3 w-3" strokeWidth={1.5} />
            Git
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-vibestrate-fg-muted">
        <span className="vibestrate-mono truncate">{worktreePath}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(worktreePath).catch(() => {});
          }}
          className="inline-flex items-center gap-1 rounded border border-vibestrate-border px-1 py-0.5 text-[10.5px] hover:bg-vibestrate-panel-2"
          title="Copy worktree path"
        >
          <Copy className="h-3 w-3" strokeWidth={1.5} />
        </button>
        {taskId ? (
          <button
            type="button"
            onClick={() => onOpenTask(taskId)}
            className="ml-auto rounded border border-vibestrate-border px-1.5 py-0.5 text-[10.5px] text-vibestrate-accent hover:bg-vibestrate-panel-2"
          >
            task {taskId} →
          </button>
        ) : null}
      </div>
    </div>
  );
}
