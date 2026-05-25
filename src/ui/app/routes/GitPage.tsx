/**
 * Git page — consumer-friendly view of the project's git state plus
 * per-run worktrees. Written in plain language: "Changes since the
 * last commit", "What each run changed", "Recent activity". Avoids
 * git jargon (rebase / staged / etc.) and shows commits with a
 * one-line summary, author, and time-ago.
 *
 * Sections:
 *   1. Project header — branch + ahead/behind + dirty state at a glance
 *   2. Uncommitted changes — file list with insert/delete counts
 *   3. Recent commits — last 10 commits with short hash + subject
 *   4. Per-run worktrees — one card per active/recent run with its
 *      branch + diff stats; click to inspect in Codebase
 */
import { useEffect, useMemo, useState } from "react";
import {
  CircleDot,
  FileText,
  GitBranch,
  GitCommit as GitCommitIcon,
  History,
  RefreshCw,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  DiffSnapshot,
  GitHistory,
  GitStatus,
  RunState,
} from "../../lib/types.js";
import { Chip } from "../../components/design/Chip.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import { cn } from "../../components/design/cn.js";
import { relTime } from "../../components/design/format.js";

type Props = {
  initialRunId?: string | null;
  onSelectRun: (runId: string) => void;
};

export function GitPage({ onSelectRun }: Props) {
  const [projectStatus, setProjectStatus] = useState<GitStatus | null>(null);
  const [projectHistory, setProjectHistory] = useState<GitHistory | null>(null);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [diffsByRun, setDiffsByRun] = useState<Record<string, DiffSnapshot | null>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const [s, h, r] = await Promise.all([
        api.getProjectGitStatus(),
        api.getProjectGitHistory(10),
        api.listRuns(),
      ]);
      setProjectStatus(s);
      setProjectHistory(h);
      setRuns(r);

      // Best-effort per-run diff snapshot for active worktrees.
      const active = r.filter(
        (run) =>
          run.worktreePath &&
          ["planning", "architecting", "executing", "validating",
           "reviewing", "fixing", "verifying", "waiting_for_approval",
           "merge_ready", "paused"].includes(run.status),
      );
      const diffs: Record<string, DiffSnapshot | null> = {};
      await Promise.all(
        active.map(async (run) => {
          try {
            diffs[run.runId] = await api.getDiff(run.runId);
          } catch {
            diffs[run.runId] = null;
          }
        }),
      );
      setDiffsByRun(diffs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 8000);
    return () => window.clearInterval(id);
  }, []);

  const activeWorktrees = useMemo(
    () =>
      runs.filter(
        (r) =>
          r.worktreePath &&
          ["planning", "architecting", "executing", "validating",
           "reviewing", "fixing", "verifying", "waiting_for_approval",
           "merge_ready", "paused"].includes(r.status),
      ),
    [runs],
  );

  return (
    <div className="relative z-10 mx-auto max-w-[1280px] px-6 pt-5 pb-12">
      {/* Compact header */}
      <section className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="eyebrow">Git</span>
          <span className="text-fog-500">·</span>
          <h1 className="text-[15px] font-semibold tracking-tight text-fog-100">
            {projectStatus?.branch ? (
              <>
                On branch{" "}
                <span className="mono text-violet-soft">
                  {projectStatus.branch}
                </span>
              </>
            ) : (
              "Project repository"
            )}
          </h1>
          {projectStatus ? (
            <ProjectStateChips status={projectStatus} />
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="h-8 px-2.5 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-[12px] text-fog-300 flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            strokeWidth={1.6}
          />
          Refresh
        </button>
      </section>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {/* Two-column main: changes (left) + recent commits (right) */}
      <section className="grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-7 glass p-4">
          <SectionEyebrow className="mb-3">
            <span>Changes since the last commit</span>
            {projectStatus ? (
              <span className="mono text-[11px] text-fog-400">
                {projectStatus.changedFiles.length} file
                {projectStatus.changedFiles.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </SectionEyebrow>
          {!projectStatus ? (
            <div className="text-[12.5px] text-fog-400">Loading…</div>
          ) : projectStatus.changedFiles.length === 0 ? (
            <div className="text-[12.5px] text-fog-400">
              Nothing changed. Your working tree matches the last commit.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {projectStatus.changedFiles.slice(0, 50).map((f) => (
                <li
                  key={f.path}
                  className="flex items-center gap-2.5 rounded-md border border-white/[0.05] bg-white/[0.018] px-2.5 py-1.5"
                >
                  <ChangeKindBadge status={f.status} />
                  <FileText className="h-3 w-3 text-fog-500" strokeWidth={1.7} />
                  <span className="flex-1 mono text-[12px] text-fog-100 truncate">
                    {f.path}
                  </span>
                </li>
              ))}
              {projectStatus.changedFiles.length > 50 ? (
                <li className="text-[11.5px] text-fog-500 mono pl-1">
                  …{projectStatus.changedFiles.length - 50} more
                </li>
              ) : null}
            </ul>
          )}
        </div>

        <div className="col-span-12 xl:col-span-5 glass p-4">
          <SectionEyebrow className="mb-3">
            <span>Recent commits</span>
            {projectHistory ? (
              <span className="mono text-[11px] text-fog-400">
                {projectHistory.commits.length}
              </span>
            ) : null}
          </SectionEyebrow>
          {!projectHistory ? (
            <div className="text-[12.5px] text-fog-400">Loading…</div>
          ) : projectHistory.commits.length === 0 ? (
            <div className="text-[12.5px] text-fog-400">No commits yet.</div>
          ) : (
            <ol className="space-y-2">
              {projectHistory.commits.map((c) => (
                <li
                  key={c.hash}
                  className="rounded-md border border-white/[0.05] bg-white/[0.018] px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <GitCommitIcon
                      className="h-3 w-3 text-violet-soft mt-0.5 shrink-0"
                      strokeWidth={1.7}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-fog-100 leading-snug truncate">
                        {c.subject}
                      </div>
                      <div className="text-[10.5px] text-fog-500 mono mt-0.5 truncate">
                        {c.shortHash} · {c.author} · {relTime(c.date)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Per-run worktrees */}
      <section className="mt-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="eyebrow">
            What each run changed · {activeWorktrees.length} active worktree
            {activeWorktrees.length === 1 ? "" : "s"}
          </div>
          <span className="text-[11px] text-fog-500 mono">
            click a worktree to open it in Codebase
          </span>
        </div>
        {activeWorktrees.length === 0 ? (
          <div className="glass px-6 py-10 text-center text-[12.5px] text-fog-400">
            No active worktrees right now. Each run gets its own branch — they
            show up here while the run is in flight.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeWorktrees.map((r) => (
              <WorktreeCard
                key={r.runId}
                run={r}
                diff={diffsByRun[r.runId] ?? null}
                onOpen={onSelectRun}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectStateChips({ status }: { status: GitStatus }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
      {status.isDirty ? (
        <Chip tone="amber">
          <CircleDot className="h-2.5 w-2.5" strokeWidth={1.7} /> uncommitted
        </Chip>
      ) : (
        <Chip tone="emerald">clean</Chip>
      )}
      {status.ahead !== null && status.ahead > 0 ? (
        <Chip tone="violet">{status.ahead} ahead</Chip>
      ) : null}
      {status.behind !== null && status.behind > 0 ? (
        <Chip tone="rose">{status.behind} behind</Chip>
      ) : null}
    </div>
  );
}

function ChangeKindBadge({ status }: { status: string }) {
  // git porcelain status codes: "A" added, "M" modified, "D" deleted,
  // "R" renamed, "??" untracked, etc. Map first non-space char to a
  // visual badge. Falls back to "M".
  const code = status.trim().charAt(0).toUpperCase();
  const map: Record<string, { label: string; cls: string }> = {
    A: { label: "+", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-400/30" },
    M: { label: "M", cls: "text-amber-300 bg-amber-500/10 border-amber-400/30" },
    D: { label: "−", cls: "text-rose-300 bg-rose-500/10 border-rose-400/30" },
    R: { label: "R", cls: "text-sky-glow bg-sky-500/10 border-sky-400/30" },
    "?": { label: "?", cls: "text-fog-400 bg-white/[0.025] border-white/10" },
  };
  const m = map[code] ?? map.M!;
  return (
    <span
      className={cn(
        "mono text-[10px] w-5 h-5 rounded border flex items-center justify-center shrink-0",
        m.cls,
      )}
      title={status}
    >
      {m.label}
    </span>
  );
}

function WorktreeCard({
  run,
  diff,
  onOpen,
}: {
  run: RunState;
  diff: DiffSnapshot | null;
  onOpen: (runId: string) => void;
}) {
  const branch = run.branchName ?? "(no branch)";
  return (
    <button
      type="button"
      onClick={() => onOpen(run.runId)}
      className="text-left rounded-xl border border-white/[0.07] bg-white/[0.022] hover:bg-white/[0.04] hover:border-violet-soft/30 transition p-3.5"
    >
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.7} />
        <span className="mono text-[12px] text-fog-100 truncate flex-1">
          {branch}
        </span>
        <span className="mono text-[10px] text-fog-500">{run.runId}</span>
      </div>
      <div className="text-[12.5px] text-fog-100 leading-snug line-clamp-2 mb-2">
        {run.task}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-fog-500 mono">
        <span className="flex items-center gap-1">
          <History className="h-2.5 w-2.5" strokeWidth={1.7} />
          {run.status}
        </span>
        {diff ? (
          <span>
            <span className="text-emerald-300/90">+{diff.totals.insertions}</span>{" "}
            <span className="text-rose-300/90">−{diff.totals.deletions}</span>{" "}
            · {diff.totals.files} file{diff.totals.files === 1 ? "" : "s"}
          </span>
        ) : (
          <span>no diff yet</span>
        )}
      </div>
    </button>
  );
}
