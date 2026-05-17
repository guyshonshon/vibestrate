import { useEffect, useState } from "react";
import { GitBranch, GitCommit } from "lucide-react";
import { api } from "../../lib/api.js";
import type { DiffSnapshot, GitStatus } from "../../lib/types.js";

/**
 * Scoped git view for a task: one summary card per linked run, showing
 * the run's branch, head commit, dirty/clean state, and diff totals
 * (added / deleted, files touched). Nothing from outside the task's
 * own runs leaks in.
 *
 * Honest empty state when there are no runs, or when worktrees have
 * been cleaned up so git data is no longer fetchable.
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
        error?: string;
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
            api.getRunGitStatus(rid).catch(() => null),
            api.getDiff(rid).catch(() => null),
          ]);
          next[rid] = { status, diff };
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

  if (runIds.length === 0) {
    return (
      <section className="rounded border border-amaco-border bg-amaco-panel p-3">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          git activity
        </div>
        <div className="mt-1 text-[12px] text-amaco-fg-muted">
          No runs yet — queue this task to see scoped git activity here.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        git activity ({runIds.length} run{runIds.length === 1 ? "" : "s"})
      </div>
      <div className="mt-1 text-[10.5px] text-amaco-fg-muted">
        Scoped to this task's worktrees — nothing from the rest of the repo.
      </div>
      <ul className="mt-2 space-y-1.5">
        {runIds.map((rid) => {
          const row = rows[rid];
          const status = row?.status ?? null;
          const diff = row?.diff ?? null;
          return (
            <li
              key={rid}
              className="rounded border border-amaco-border-soft bg-amaco-panel-2 p-2 text-[11.5px]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenRun(rid)}
                  className="amaco-mono text-[10.5px] text-amaco-accent hover:underline"
                >
                  {rid}
                </button>
                {status?.upstream || status?.headHash ? (
                  <>
                    <span className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10px]">
                      <GitBranch className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                      {status.upstream ?? status.headHash}
                    </span>
                    <span
                      className={`amaco-mono rounded border px-1.5 py-0.5 text-[10px] ${
                        status.isDirty
                          ? "border-amaco-warn/40 text-amaco-warn"
                          : "border-amaco-success/40 text-amaco-success"
                      }`}
                    >
                      {status.isDirty
                        ? `dirty (${status.changedFiles.length})`
                        : "clean"}
                    </span>
                  </>
                ) : (
                  <span className="amaco-mono text-[10px] text-amaco-fg-muted">
                    (worktree unavailable)
                  </span>
                )}
                {diff && diff.totals.files > 0 ? (
                  <span
                    className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10px]"
                    title={`${diff.totals.files} file(s) changed`}
                  >
                    <span className="text-amaco-success">
                      +{diff.totals.insertions}
                    </span>
                    <span className="text-amaco-fail">
                      −{diff.totals.deletions}
                    </span>
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpenGit(rid)}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10px] text-amaco-fg-dim hover:bg-amaco-panel"
                  title="Open git inspector for this run"
                >
                  <GitCommit className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                  Git
                </button>
              </div>
              {status?.headHash && status.headSubject ? (
                <div className="mt-1 amaco-mono truncate text-[10.5px] text-amaco-fg-muted">
                  {status.headHash} · {status.headSubject}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
