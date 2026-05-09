import { useEffect, useState } from "react";
import {
  GitBranch,
  Home,
  Folder,
  Activity,
  LayoutGrid,
  ListChecks,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunState } from "../../lib/types.js";
import { RunStatusBadge } from "../runs/RunStatusBadge.js";

export type NavId = "runs" | "board" | "queue";

type Props = {
  currentRunId: string | null;
  currentNav: NavId;
  onSelectRun: (runId: string) => void;
  onShowRunsList: () => void;
  onShowBoard: () => void;
  onShowQueue: () => void;
};

export function Sidebar({
  currentRunId,
  currentNav,
  onSelectRun,
  onShowRunsList,
  onShowBoard,
  onShowQueue,
}: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.listRuns();
        if (!cancelled) setRuns([...data].reverse());
      } catch {
        // ignore — server may not be ready yet
      }
    };
    void load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const currentRun =
    currentRunId !== null
      ? runs.find((r) => r.runId === currentRunId) ?? null
      : null;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-amaco-border bg-amaco-panel">
      <header className="flex items-center gap-2 px-4 pb-3 pt-4">
        <Activity className="h-4 w-4 text-amaco-accent" strokeWidth={1.5} />
        <span className="text-[13px] font-medium tracking-wide text-amaco-fg">
          amaco
        </span>
        <span className="ml-auto text-[11px] text-amaco-fg-muted">
          supervisor
        </span>
      </header>

      <nav className="flex flex-col gap-1 px-2 pb-3">
        <button
          onClick={onShowBoard}
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-amaco-panel-2 ${
            currentNav === "board"
              ? "bg-amaco-panel-2 text-amaco-fg"
              : "text-amaco-fg-dim"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.5} />
          Board
        </button>
        <button
          onClick={onShowQueue}
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-amaco-panel-2 ${
            currentNav === "queue"
              ? "bg-amaco-panel-2 text-amaco-fg"
              : "text-amaco-fg-dim"
          }`}
        >
          <ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} />
          Queue
        </button>
        <button
          onClick={onShowRunsList}
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-amaco-panel-2 ${
            currentNav === "runs" && currentRunId === null
              ? "bg-amaco-panel-2 text-amaco-fg"
              : "text-amaco-fg-dim"
          }`}
        >
          <Home className="h-3.5 w-3.5" strokeWidth={1.5} />
          All runs
        </button>
      </nav>

      <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        Recent runs
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-2">
        {runs.length === 0 ? (
          <li className="px-2 py-2 text-[12px] text-amaco-fg-muted">
            No runs yet.
          </li>
        ) : (
          runs.slice(0, 25).map((run) => (
            <li key={run.runId}>
              <button
                onClick={() => onSelectRun(run.runId)}
                className={`group flex w-full flex-col gap-1 rounded px-2 py-2 text-left transition-colors hover:bg-amaco-panel-2 ${
                  currentRunId === run.runId
                    ? "bg-amaco-panel-2"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <RunStatusBadge status={run.status} compact />
                  <span className="truncate text-[12.5px] text-amaco-fg group-hover:text-amaco-fg">
                    {run.task}
                  </span>
                </div>
                <span className="amaco-mono truncate text-[11px] text-amaco-fg-muted">
                  {run.runId}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      {currentRun ? (
        <div className="border-t border-amaco-border bg-amaco-panel-2 px-3 py-3 text-[11.5px] text-amaco-fg-dim">
          <div className="mb-1.5 truncate text-[12.5px] text-amaco-fg">
            {currentRun.task}
          </div>
          <div className="flex items-center gap-1.5">
            <RunStatusBadge status={currentRun.status} />
            {currentRun.finalDecision ? (
              <span className="amaco-mono rounded border border-amaco-border px-1 text-[10.5px] text-amaco-fg-dim">
                {currentRun.finalDecision}
              </span>
            ) : null}
            {currentRun.verification ? (
              <span className="amaco-mono rounded border border-amaco-border px-1 text-[10.5px] text-amaco-fg-dim">
                {currentRun.verification}
              </span>
            ) : null}
          </div>
          {currentRun.branchName ? (
            <div className="mt-2 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" strokeWidth={1.5} />
              <span className="amaco-mono truncate">
                {currentRun.branchName}
              </span>
            </div>
          ) : null}
          {currentRun.worktreePath ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Folder className="h-3 w-3" strokeWidth={1.5} />
              <span className="amaco-mono truncate">
                {currentRun.worktreePath}
              </span>
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-x-3 text-[11px] text-amaco-fg-muted">
            <span>started</span>
            <span className="amaco-mono text-right">
              {new Date(currentRun.startedAt).toLocaleTimeString()}
            </span>
            <span>updated</span>
            <span className="amaco-mono text-right">
              {new Date(currentRun.updatedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
