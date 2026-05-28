import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunState } from "../../lib/types.js";
import { RunStatusBadge } from "./RunStatusBadge.js";

export function RunList({
  onSelect,
  onOpenReplay,
}: {
  onSelect: (runId: string) => void;
  onOpenReplay?: (runId: string) => void;
}) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.listRuns();
        setRuns([...data].reverse());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="px-6 py-8 text-vibestrate-fg-dim">
        <div className="text-vibestrate-fail">{error}</div>
        <div className="mt-2 text-[12px]">
          Make sure <code className="vibestrate-mono">vibe ui</code> is running and a
          project is initialized in the current directory.
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="px-6 py-8 text-vibestrate-fg-dim">
        <div className="text-[14px]">No runs yet.</div>
        <div className="mt-2 text-[12.5px]">
          Run{" "}
          <code className="vibestrate-mono rounded bg-vibestrate-panel-2 px-1.5 py-0.5">
            vibe run "your task"
          </code>{" "}
          from this project.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-vibestrate-panel text-[10.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
          <tr className="border-b border-vibestrate-border">
            <th className="px-4 py-2 text-left font-medium">Run</th>
            <th className="px-4 py-2 text-left font-medium">Task</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Review</th>
            <th className="px-4 py-2 text-left font-medium">Verify</th>
            <th className="px-4 py-2 text-right font-medium">Updated</th>
            <th className="px-4 py-2 text-right font-medium" aria-label="Replay" />
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.runId}
              onClick={() => onSelect(run.runId)}
              className="cursor-pointer border-b border-vibestrate-border-soft hover:bg-vibestrate-panel-2"
            >
              <td className="vibestrate-mono px-4 py-2 text-vibestrate-fg-dim">
                {run.runId}
              </td>
              <td className="px-4 py-2 text-vibestrate-fg">{run.task}</td>
              <td className="px-4 py-2">
                <RunStatusBadge status={run.status} />
              </td>
              <td className="vibestrate-mono px-4 py-2 text-vibestrate-fg-dim">
                {run.finalDecision ?? "—"}
              </td>
              <td className="vibestrate-mono px-4 py-2 text-vibestrate-fg-dim">
                {run.verification ?? "—"}
              </td>
              <td className="vibestrate-mono px-4 py-2 text-right text-vibestrate-fg-muted">
                {new Date(run.updatedAt).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right">
                {onOpenReplay ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      // The whole row navigates to the run's default tab;
                      // this button skips that and opens straight to Replay.
                      e.stopPropagation();
                      onOpenReplay(run.runId);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:bg-vibestrate-panel"
                    title="Open the read-only Replay timeline for this run"
                  >
                    <History className="h-3 w-3" strokeWidth={1.5} />
                    Replay
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
