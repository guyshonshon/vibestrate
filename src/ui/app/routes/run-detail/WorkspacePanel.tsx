import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/design/Button.js";
import { AlertTriangle, Bolt, Cpu, FolderTree, Scale, ShieldCheck } from "lucide-react";

export function WorkspacePanel({
  worktreePath,
  branchName,
}: {
  worktreePath: string;
  branchName: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const cdLine = `cd ${/[^A-Za-z0-9_./-]/.test(worktreePath) ? `'${worktreePath.replace(/'/g, `'\\''`)}'` : worktreePath}`;
  const copy = () => {
    void navigator.clipboard?.writeText(cdLine).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-coal-500/60 text-chalk-300">
          <FolderTree className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-violet-soft">
            Workspace
          </div>
          <div className="truncate text-[12.5px] font-semibold text-chalk-100">
            {branchName ? <span className="mono">{branchName}</span> : "git worktree"}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={copy}
          title="Copy a cd command for this run's git worktree"
        >
          {copied ? "Copied" : "Copy cd"}
        </Button>
      </div>
      <div className="mt-2.5 rounded-[12px] bg-coal-500/40 px-3 py-2">
        <div className="mono truncate text-[12px] text-chalk-300" title={worktreePath}>
          {worktreePath}
        </div>
      </div>
      <div className="mt-1.5 text-[11px] text-chalk-400">
        The run's isolated git worktree. Run <span className="mono">vibe path</span> for the same from the CLI.
      </div>
    </div>
  );
}

/** Compact, evidence-backed run-assurance verdict. */
