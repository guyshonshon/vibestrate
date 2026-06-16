import { ArrowRight, ChevronRight, Check, XCircle } from "lucide-react";
import { Chip } from "../../design/Chip.js";
import { cn } from "../../design/cn.js";
import { fmtElapsed, relTime, runLabel, shortRunId } from "../../design/format.js";
import type { RunState } from "../../../lib/types.js";

export function RecentRunsSection({
  runs,
  onOpen,
  onShowAll,
}: {
  runs: RunState[];
  onOpen: (runId: string) => void;
  onShowAll: () => void;
}) {
  if (runs.length === 0) return null;
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-[18px] font-semibold tracking-tight">
          Recent runs
        </h2>
        <button
          type="button"
          onClick={onShowAll}
          className="text-[12px] text-fog-300 hover:text-fog-100 flex items-center gap-1"
        >
          View all <ArrowRight className="h-3 w-3" strokeWidth={1.7} />
        </button>
      </div>
      <div className="slab overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-fog-500">
              <th className="font-normal px-4 py-2.5">Run</th>
              <th className="font-normal px-3 py-2.5">Status</th>
              <th className="font-normal px-3 py-2.5">When</th>
              <th className="font-normal px-3 py-2.5 text-right">Duration</th>
              <th className="font-normal px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => {
              const mergeReady = r.status === "merge_ready";
              const failed =
                r.status === "failed" || r.status === "aborted";
              return (
                <tr
                  key={r.runId}
                  onClick={() => onOpen(r.runId)}
                  className={cn(
                    "cursor-pointer hover:bg-white/[0.025] transition-colors",
                    i !== 0 && "border-t border-white/[0.05]",
                  )}
                >
                  <td className="px-4 py-3">
                    {/* Task first - the full id was shrink-0 and starved the
                     * task title, the one column a human scans. */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[13px] text-fog-100 truncate max-w-[480px]" title={r.task}>
                        {runLabel(r)}
                      </span>
                      <span
                        className="mono text-[11px] text-fog-500 shrink-0"
                        title={r.runId}
                      >
                        {shortRunId(r.runId)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {/* merge_ready means ready for review, not merged - the
                     * old "Merged" label claimed an action that never ran. */}
                    {mergeReady ? (
                      <Chip tone="emerald">
                        <Check className="h-3 w-3" strokeWidth={1.7} /> Merge
                        ready
                      </Chip>
                    ) : failed ? (
                      <Chip tone="rose">
                        <XCircle className="h-3 w-3" strokeWidth={1.7} />{" "}
                        {r.status}
                      </Chip>
                    ) : (
                      <Chip tone="amber">{r.status}</Chip>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-fog-300 whitespace-nowrap">
                    {relTime(r.updatedAt)}
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
                  <td className="px-3 py-3 text-right">
                    <ChevronRight
                      className="h-3.5 w-3.5 text-fog-500 inline"
                      strokeWidth={1.7}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
