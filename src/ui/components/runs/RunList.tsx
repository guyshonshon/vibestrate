import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { RunState } from "../../lib/types.js";
import { RunStatusBadge } from "./RunStatusBadge.js";

export function RunList({
  onSelect,
}: {
  onSelect: (runId: string) => void;
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
      <div className="px-6 py-8 text-amaco-fg-dim">
        <div className="text-amaco-fail">{error}</div>
        <div className="mt-2 text-[12px]">
          Make sure <code className="amaco-mono">amaco ui</code> is running and a
          project is initialized in the current directory.
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="px-6 py-8 text-amaco-fg-dim">
        <div className="text-[14px]">No runs yet.</div>
        <div className="mt-2 text-[12.5px]">
          Run{" "}
          <code className="amaco-mono rounded bg-amaco-panel-2 px-1.5 py-0.5">
            amaco run "your task"
          </code>{" "}
          from this project.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-amaco-panel text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
          <tr className="border-b border-amaco-border">
            <th className="px-4 py-2 text-left font-medium">Run</th>
            <th className="px-4 py-2 text-left font-medium">Task</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Review</th>
            <th className="px-4 py-2 text-left font-medium">Verify</th>
            <th className="px-4 py-2 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.runId}
              onClick={() => onSelect(run.runId)}
              className="cursor-pointer border-b border-amaco-border-soft hover:bg-amaco-panel-2"
            >
              <td className="amaco-mono px-4 py-2 text-amaco-fg-dim">
                {run.runId}
              </td>
              <td className="px-4 py-2 text-amaco-fg">{run.task}</td>
              <td className="px-4 py-2">
                <RunStatusBadge status={run.status} />
              </td>
              <td className="amaco-mono px-4 py-2 text-amaco-fg-dim">
                {run.finalDecision ?? "—"}
              </td>
              <td className="amaco-mono px-4 py-2 text-amaco-fg-dim">
                {run.verification ?? "—"}
              </td>
              <td className="amaco-mono px-4 py-2 text-right text-amaco-fg-muted">
                {new Date(run.updatedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
