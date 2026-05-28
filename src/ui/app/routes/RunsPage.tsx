import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunState, RunStatus } from "../../lib/types.js";
import { cn } from "../../components/design/cn.js";
import { Chip } from "../../components/design/Chip.js";
import { fmtElapsed, relTime } from "../../components/design/format.js";

function statusTone(
  s: RunStatus,
): "violet" | "sky" | "amber" | "emerald" | "rose" | "neutral" {
  if (s === "waiting_for_approval" || s === "paused") return "amber";
  if (s === "reviewing" || s === "verifying" || s === "validating") return "sky";
  if (s === "merge_ready") return "emerald";
  if (s === "failed" || s === "aborted" || s === "blocked") return "rose";
  return "violet";
}

/**
 * Overflow view of every run on disk. Mission Control caps Recent Runs
 * at six; this page lists everything with one-click open + Replay.
 */
export function RunsPage({
  onSelect,
  onOpenReplay,
}: {
  onSelect: (runId: string) => void;
  onOpenReplay?: (runId: string) => void;
}) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
    const interval = window.setInterval(load, 4000);
    return () => window.clearInterval(interval);
  }, []);

  const filtered = query
    ? runs.filter(
        (r) =>
          r.task.toLowerCase().includes(query.toLowerCase()) ||
          r.runId.toLowerCase().includes(query.toLowerCase()),
      )
    : runs;

  return (
    <div className="relative z-10 w-full px-6 pt-5 pb-12">
      <section className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="eyebrow">Runs</span>
          <span className="text-fog-500">·</span>
          <h1 className="text-[15px] font-semibold tracking-tight text-fog-100">
            All runs{" "}
            <span className="mono text-[12px] text-fog-500 num-tabular">
              {runs.length}
            </span>
          </h1>
          <span className="text-[11.5px] text-fog-500 hidden md:inline">
            click a row to open · polled every 4 s
          </span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by task or id…"
          className="h-8 w-[260px] rounded-md bg-white/[0.025] border border-white/[0.08] px-3 text-[12px] text-fog-100 placeholder:text-fog-500 focus:outline-none focus:border-violet-soft/35"
        />
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="glass overflow-hidden mt-5">
        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-[12.5px] text-fog-400">
            {runs.length === 0 ? (
              <>
                No runs yet. Try{" "}
                <span className="mono text-fog-200">vibestrate run "your task"</span>{" "}
                from this project.
              </>
            ) : (
              <>No runs match this filter.</>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-fog-500">
                <th className="font-normal px-4 py-2.5">Run</th>
                <th className="font-normal px-3 py-2.5">Task</th>
                <th className="font-normal px-3 py-2.5">Status</th>
                <th className="font-normal px-3 py-2.5">Review</th>
                <th className="font-normal px-3 py-2.5">Verify</th>
                <th className="font-normal px-3 py-2.5 text-right">Duration</th>
                <th className="font-normal px-3 py-2.5 text-right">Updated</th>
                <th className="font-normal px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.runId}
                  onClick={() => onSelect(r.runId)}
                  className={cn(
                    "cursor-pointer hover:bg-white/[0.025] transition-colors",
                    i !== 0 && "border-t border-white/[0.05]",
                  )}
                >
                  <td className="px-4 py-3 mono text-[11px] text-fog-500 whitespace-nowrap">
                    {r.runId}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-fog-100 truncate max-w-[420px]">
                    {r.task}
                  </td>
                  <td className="px-3 py-3">
                    <Chip tone={statusTone(r.status)}>
                      {r.status === "executing" ||
                      r.status === "validating" ||
                      r.status === "reviewing" ||
                      r.status === "fixing" ||
                      r.status === "verifying" ? (
                        <span className="pulse-dot" />
                      ) : null}
                      {r.status}
                    </Chip>
                  </td>
                  <td className="px-3 py-3 mono text-[11.5px] text-fog-300">
                    {r.finalDecision ?? "—"}
                  </td>
                  <td className="px-3 py-3 mono text-[11.5px] text-fog-300">
                    {r.verification ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right mono text-[12px] text-fog-200 num-tabular whitespace-nowrap">
                    {fmtElapsed(
                      Math.max(
                        0,
                        Math.floor(
                          (new Date(r.updatedAt).getTime() -
                            new Date(r.startedAt).getTime()) /
                            1000,
                        ),
                      ),
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-[11.5px] text-fog-400 whitespace-nowrap">
                    {relTime(r.updatedAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {onOpenReplay ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReplay(r.runId);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[10.5px] text-fog-300 hover:text-fog-100 hover:bg-white/[0.05]"
                        title="Open the read-only Replay timeline"
                      >
                        <History className="h-3 w-3" strokeWidth={1.6} />
                        Replay
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
