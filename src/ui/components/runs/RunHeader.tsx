import { GitBranch, Folder, Clock } from "lucide-react";
import type { RunState } from "../../lib/types.js";
import { RunStatusBadge } from "./RunStatusBadge.js";

export function RunHeader({ run }: { run: RunState }) {
  return (
    <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            <span className="amaco-mono">{run.runId}</span>
          </div>
          <h1 className="mt-1 truncate text-[16px] font-medium text-amaco-fg">
            {run.task}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-amaco-fg-dim">
            <RunStatusBadge status={run.status} />
            {run.finalDecision ? (
              <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
                {run.finalDecision}
              </span>
            ) : null}
            {run.verification ? (
              <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
                {run.verification}
              </span>
            ) : null}
            {run.branchName ? (
              <span className="amaco-mono inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" strokeWidth={1.5} />
                {run.branchName}
              </span>
            ) : null}
            {run.worktreePath ? (
              <span className="amaco-mono inline-flex items-center gap-1 truncate">
                <Folder className="h-3 w-3" strokeWidth={1.5} />
                {run.worktreePath}
              </span>
            ) : null}
            <span className="amaco-mono inline-flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.5} />
              {new Date(run.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
