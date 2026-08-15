import { useEffect, useState } from "react";
import { GitBranch, GitCommit } from "lucide-react";
import { ApiError, api } from "../../lib/api.js";
import type { DiffSnapshot, GitStatus } from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";
import { describeError } from "../../lib/error-view.js";
import { settle, errorOf } from "../../lib/settled.js";

const CARD = "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4";

/** A 404 here is the answer, not a failure: the run's worktree was cleaned up. */
function gone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** Inline rose marker for a per-row fetch that failed, hover for the reason. */
function RowError({ err, label }: { err: unknown; label: string }) {
  return (
    <span
      className="rounded-[7px] bg-rose-500/14 px-1.5 py-0.5 text-meta font-semibold text-rose-300"
      title={describeError(err).title}
    >
      {label}
    </span>
  );
}

/**
 * Scoped git view for a task: one summary row per linked run, showing the run's
 * branch, head commit, dirty/clean state, and diff totals. Nothing from outside
 * the task's own runs leaks in. Honest empty state when there are no runs (or
 * worktrees were cleaned up so git data is no longer fetchable). On the Mission
 * Control idiom.
 */
export function TaskGitActivity({
  runIds,
  onOpenRun,
  onOpenGit,
}: {
  runIds: string[];
  onOpenRun: (runId: string) => void;
  onOpenGit: (runId: string) => void;
}) {
  const [rows, setRows] = useState<
    Record<
      string,
      {
        status: GitStatus | null;
        diff: DiffSnapshot | null;
        // A run whose worktree was cleaned up 404s, and that is a real answer
        // ("gone"). Any other failure is us not knowing - kept apart so the row
        // never presents an unreadable worktree as a clean one with no diff.
        statusError: unknown;
        diffError: unknown;
      }
    >
  >({});

  useEffect(() => {
    if (runIds.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const next: typeof rows = {};
      await Promise.all(
        runIds.map(async (rid) => {
          const [status, diff] = await Promise.all([
            settle(api.getRunGitStatus(rid)),
            settle(api.getDiff(rid)),
          ]);
          next[rid] = {
            status: status.ok ? status.value : null,
            diff: diff.ok ? diff.value : null,
            statusError: gone(errorOf(status)) ? null : errorOf(status),
            diffError: gone(errorOf(diff)) ? null : errorOf(diff),
          };
        }),
      );
      if (!cancelled) setRows(next);
    };
    void load();
    const i = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [runIds.join(",")]);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[18px] font-bold text-violet-vivid">
        Git activity
        {runIds.length > 0 ? (
          <span className="text-[13px] font-medium text-chalk-400">{runIds.length}</span>
        ) : null}
      </h2>
      <div className={CARD}>
        {runIds.length === 0 ? (
          <div className="text-[12px] text-chalk-400">
            No runs yet.
          </div>
        ) : Object.keys(rows).length === 0 ? (
          // Every row lands in one `setRows`, so an empty map is the first
          // fetch - during which each row otherwise claimed "worktree
          // unavailable" about a worktree nobody had looked at yet.
          <Skeleton label="Loading git activity" className="flex flex-col gap-1.5">
            <SkeletonBlock tone="text" h={11} w="58%" className="mb-1" />
            {runIds.map((rid) => (
              <div
                key={rid}
                className="flex items-center gap-2 rounded-[12px] bg-coal-500/60 px-3 py-2"
              >
                <SkeletonBlock tone="text" h={11} w={132} />
                <SkeletonBlock h={18} w={88} radius={7} />
                <SkeletonBlock h={18} w={62} radius={7} />
                <SkeletonBlock h={22} w={48} radius={8} className="ml-auto" />
              </div>
            ))}
          </Skeleton>
        ) : (
          <>
            <div className="text-meta text-chalk-400">
              Scoped to this task's worktrees - nothing from the rest of the repo.
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {runIds.map((rid) => {
                const row = rows[rid];
                const status = row?.status ?? null;
                const diff = row?.diff ?? null;
                return (
                  <li
                    key={rid}
                    className="rounded-[12px] bg-coal-500/60 px-3 py-2 text-meta"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenRun(rid)}
                        className="font-mono text-meta text-violet-soft transition hover:text-violet-soft/80"
                      >
                        {rid}
                      </button>
                      {status?.upstream || status?.headHash ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-[7px] bg-coal-500 px-1.5 py-0.5 text-meta text-chalk-300">
                            <GitBranch className="h-3 w-3" strokeWidth={1.9} aria-hidden />
                            {status.upstream ?? status.headHash}
                          </span>
                          <span
                            className={cn(
                              "rounded-[7px] px-1.5 py-0.5 text-meta font-semibold",
                              status.isDirty
                                ? "bg-amber-soft/14 text-amber-soft"
                                : "bg-emerald-400/14 text-emerald-400",
                            )}
                          >
                            {status.isDirty
                              ? `dirty (${status.changedFiles.length})`
                              : "clean"}
                          </span>
                        </>
                      ) : row?.statusError ? (
                        <RowError err={row.statusError} label="git status failed" />
                      ) : (
                        <span className="text-meta text-chalk-400">
                          (worktree unavailable)
                        </span>
                      )}
                      {row?.diffError ? (
                        <RowError err={row.diffError} label="diff failed" />
                      ) : diff && diff.totals.files > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-[7px] bg-coal-500 px-1.5 py-0.5 text-meta"
                          title={`${diff.totals.files} file(s) changed`}
                        >
                          <span className="text-emerald-400">+{diff.totals.insertions}</span>
                          <span className="text-rose-300">-{diff.totals.deletions}</span>
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpenGit(rid)}
                        className="ml-auto inline-flex items-center gap-1 rounded-[8px] bg-coal-500 px-2 py-1 text-meta text-chalk-300 transition hover:bg-coal-400 hover:text-chalk-100"
                        title="Open git inspector for this run"
                      >
                        <GitCommit className="h-3 w-3" strokeWidth={1.9} aria-hidden />
                        Git
                      </button>
                    </div>
                    {status?.headHash && status.headSubject ? (
                      <div className="mt-1 truncate text-meta text-chalk-400">
                        <span className="font-mono">{status.headHash}</span> -{" "}
                        {status.headSubject}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
