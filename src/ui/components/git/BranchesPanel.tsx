/**
 * BranchesPanel - every local branch as a dense row, so you can see each
 * branch even when the history is linear (ff-only) and the graph collapses to
 * one rail. Each row shows the branch's standing vs main: ahead/behind, its
 * own diffstat, merged/open, and its tip. Clicking a branch selects its tip in
 * the graph and prefills it as the merge planner's source.
 */
import { ArrowDown, ArrowUp, Check, GitBranch } from "lucide-react";
import type { GitBranchOverview, GitBranchesOverview } from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { relTime } from "../design/format.js";

type Props = {
  overview: GitBranchesOverview | null;
  loading: boolean;
  selectedBranch: string | null;
  onSelectBranch: (b: GitBranchOverview) => void;
  onRetry: () => void;
};

export function BranchesPanel({
  overview,
  loading,
  selectedBranch,
  onSelectBranch,
  onRetry,
}: Props) {
  if (loading && !overview) {
    return (
      <div className="px-3 py-6 text-[12.5px] text-chalk-300">Loading branches…</div>
    );
  }
  if (!overview || !overview.available) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <GitBranch className="h-5 w-5 text-violet-soft" strokeWidth={1.7} />
        <p className="text-[12.5px] text-chalk-300">
          Branches are unavailable - refresh once git is ready.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-[12px] font-semibold text-violet-soft hover:text-violet-soft/80"
        >
          Retry
        </button>
      </div>
    );
  }

  const { branches, mainBranch } = overview;
  const open = branches.filter((b) => !b.isMain && !b.mergedIntoMain).length;
  const merged = branches.filter((b) => b.mergedIntoMain).length;

  return (
    <div className="flex flex-col">
      {/* A one-line ledger of what's out there. */}
      <div className="flex items-center gap-3 border-b border-[color:var(--line-soft)] px-3 py-2 text-[11px]">
        <span className="font-semibold text-chalk-100">
          {branches.length} branch{branches.length === 1 ? "" : "es"}
        </span>
        <span className="text-emerald-400">{open} open</span>
        <span className="text-chalk-400">{merged} merged</span>
      </div>
      <ul>
        {branches.map((b) => (
          <li key={b.name}>
            <BranchRow
              branch={b}
              mainBranch={mainBranch}
              selected={b.name === selectedBranch}
              onSelect={() => onSelectBranch(b)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BranchRow({
  branch: b,
  mainBranch,
  selected,
  onSelect,
}: {
  branch: GitBranchOverview;
  mainBranch: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = b.isMain ? "main" : b.mergedIntoMain ? "merged" : "open";
  const stateTone =
    state === "main"
      ? "text-violet-soft"
      : state === "merged"
        ? "text-chalk-400"
        : "text-emerald-400";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-[color:var(--line-soft)] px-3 py-2 text-left transition",
        selected ? "bg-violet-soft/10" : "hover:bg-coal-500/60",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch
          className={cn("h-3.5 w-3.5 shrink-0", stateTone)}
          strokeWidth={1.9}
          aria-hidden
        />
        <span className="mono min-w-0 flex-1 truncate text-[12.5px] font-semibold text-chalk-100">
          {b.name}
        </span>
        {/* State as flat tinted text, never a pill. */}
        <span className={cn("shrink-0 text-[10.5px] font-semibold", stateTone)}>
          {state === "merged" ? (
            <span className="inline-flex items-center gap-0.5">
              <Check className="h-3 w-3" strokeWidth={2.2} /> merged
            </span>
          ) : (
            state
          )}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2.5 pl-[22px] text-[10.5px]">
        {b.isMain ? (
          <span className="text-chalk-400">base branch</span>
        ) : (
          <>
            {/* ahead/behind vs main. */}
            <span className="num-tabular flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center",
                  b.ahead > 0 ? "text-emerald-400" : "text-chalk-400",
                )}
                title={`${b.ahead} commit(s) ahead of ${mainBranch}`}
              >
                <ArrowUp className="h-2.5 w-2.5" strokeWidth={2.2} />
                {b.ahead}
              </span>
              <span
                className={cn(
                  "inline-flex items-center",
                  b.behind > 0 ? "text-amber-soft" : "text-chalk-400",
                )}
                title={`${b.behind} commit(s) behind ${mainBranch}`}
              >
                <ArrowDown className="h-2.5 w-2.5" strokeWidth={2.2} />
                {b.behind}
              </span>
            </span>
            {b.stats ? (
              <span className="num-tabular shrink-0 font-semibold">
                <span className="text-emerald-400">+{b.stats.insertions}</span>{" "}
                <span className="text-rose-300">-{b.stats.deletions}</span>
              </span>
            ) : null}
          </>
        )}
        <span className="min-w-0 flex-1 truncate text-chalk-300" title={b.subject}>
          {b.subject}
        </span>
        <span className="shrink-0 text-chalk-400">{relTime(b.date)}</span>
      </div>
    </button>
  );
}
