import { useCallback, useEffect, useState } from "react";
import { GitMerge, History, Plus } from "lucide-react";
import { api } from "../../lib/api.js";
import { ErrorView } from "../../lib/error-view.js";
import type { RunState } from "../../lib/types.js";
import { isSpecUpRun } from "../../lib/run-outcome.js";
import { cn } from "../../components/design/cn.js";
import {
  fmtElapsed,
  relTime,
  shortRunId,
} from "../../components/design/format.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import { SchedulerQueuePanel } from "../../components/runs/SchedulerQueuePanel.js";
import { PruneSnapshotsButton } from "../../components/runs/PruneSnapshotsButton.js";
import { Button } from "../../components/design/Button.js";
import { PageShell, PageHeader } from "../../components/layout/PageShell.js";
import { navigate } from "../App.js";

/**
 * Overflow view of every run on disk. Mission Control caps Recent Runs
 * at six; this page lists everything with one-click open + Replay.
 */
export function RunsPage({
  onSelect,
  onOpenReplay,
  onOpenTask,
}: {
  onSelect: (runId: string) => void;
  onOpenReplay?: (runId: string) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.listRuns();
      setRuns([...data].reverse());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 4000);
    return () => window.clearInterval(interval);
  }, [load]);

  const filtered = query
    ? runs.filter(
        (r) =>
          r.task.toLowerCase().includes(query.toLowerCase()) ||
          r.runId.toLowerCase().includes(query.toLowerCase()),
      )
    : runs;

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            All runs
            <span className="mono num-tabular text-[14px] font-semibold text-chalk-400">
              {runs.length}
            </span>
          </span>
        }
        actions={
          <>
            <PruneSnapshotsButton />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by task or id…"
              className="h-8 w-[260px] rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-3 text-[12px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
            />
          </>
        }
      />

      {error ? (
        <ErrorView className="mt-4" compact err={error} onRetry={() => void load()} />
      ) : null}

      {onOpenTask ? <SchedulerQueuePanel onOpenTask={onOpenTask} /> : null}

      <IntegrationPanel />

      <div className="mt-5 overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600">
        {filtered.length === 0 ? (
          runs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-[13px] text-chalk-300">No runs yet.</p>
              <Button
                variant="primary"
                size="sm"
                iconLeft={<Plus className="h-3.5 w-3.5" strokeWidth={1.9} />}
                onClick={() => navigate({ kind: "compose" })}
              >
                New run
              </Button>
              <p className="mono text-[11px] text-chalk-400">
                or from this project: vibe run "your task"
              </p>
            </div>
          ) : (
            <div className="px-6 py-10 text-center text-[12.5px] text-chalk-300">
              No runs match this filter.
            </div>
          )
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-chalk-400">
                <th className="px-4 py-2.5 font-semibold">Task</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Review</th>
                <th className="px-3 py-2.5 font-semibold">Verify</th>
                <th className="px-3 py-2.5 text-right font-semibold">Duration</th>
                <th className="px-3 py-2.5 text-right font-semibold">Updated</th>
                <th className="px-3 py-2.5 font-semibold">Run</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.runId}
                  onClick={() => onSelect(r.runId)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-coal-500/40",
                    i !== 0 && "border-t border-[color:var(--line-soft)]",
                  )}
                >
                  <td className="max-w-[420px] truncate px-4 py-3 text-[13px] text-chalk-100">
                    {r.task}
                  </td>
                  <td className="px-3 py-3">
                    {isSpecUpRun(r) ? (
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-violet-soft">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-soft" />
                        spec-up
                      </span>
                    ) : (
                      <RunStatusBadge status={r.status} compact />
                    )}
                  </td>
                  <td className="mono px-3 py-3 text-[11.5px] text-chalk-300">
                    {r.finalDecision ?? <span className="text-chalk-400">-</span>}
                  </td>
                  <td className="mono px-3 py-3 text-[11.5px] text-chalk-300">
                    {r.verification ?? <span className="text-chalk-400">-</span>}
                  </td>
                  <td className="mono num-tabular whitespace-nowrap px-3 py-3 text-right text-[12px] text-chalk-300">
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
                  <td className="whitespace-nowrap px-3 py-3 text-right text-[11.5px] text-chalk-400">
                    {relTime(r.updatedAt)}
                  </td>
                  <td
                    className="mono whitespace-nowrap px-3 py-3 text-[11px] text-chalk-400"
                    title={r.runId}
                  >
                    {shortRunId(r.runId)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {onOpenReplay ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReplay(r.runId);
                        }}
                        className="inline-flex items-center gap-1 rounded-[8px] bg-coal-500 px-2 py-1 text-[10.5px] font-medium text-chalk-300 transition hover:bg-coal-400 hover:text-chalk-100"
                        title="Open the read-only Replay timeline"
                      >
                        <History className="h-3 w-3" strokeWidth={1.9} />
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
    </PageShell>
  );
}

type MergeReady = { runId: string; task: string; branchName: string; taskId: string | null };
type PreviewRow = { branch: string; runId?: string; clean: boolean; conflictedFiles: string[]; note: string };

/**
 * Integration surface: preview real git merges of merge-ready run
 * branches, then integrate the clean ones into a dedicated branch. Never main,
 * never push. Only shown when there are merge-ready runs.
 */
function IntegrationPanel() {
  const [ready, setReady] = useState<MergeReady[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ baseBranch: string; allClean: boolean; results: PreviewRow[] } | null>(null);
  const [into, setInto] = useState("integration/main");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A clean, complete integration branch eligible for merge-to-main (P7b). */
  const [finishable, setFinishable] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listMergeReady()
      .then((r) => {
        if (cancelled) return;
        setReady(r);
        setSelected(new Set(r.map((x) => x.runId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (ready.length === 0) return null;

  const ids = () => [...selected];
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5 rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-emerald-400" strokeWidth={1.9} />
          <span className="text-[13px] font-semibold text-chalk-100">
            Integrate merge-ready runs
          </span>
          <span className="mono num-tabular text-[11px] text-chalk-400">{ready.length}</span>
        </div>
        <a
          href="#/merge"
          className="text-[11.5px] font-semibold text-violet-soft transition hover:text-violet-soft/80 whitespace-nowrap"
        >
          Merge window with advice
        </a>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-chalk-400">
        <span className="rounded-[6px] bg-coal-500 px-1.5 py-0.5">never main</span>
        <span className="rounded-[6px] bg-coal-500 px-1.5 py-0.5">never push</span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {ready.map((r) => {
          const p = preview?.results.find((x) => x.runId === r.runId);
          return (
            <li
              key={r.runId}
              className="flex items-center gap-2.5 rounded-[12px] bg-coal-500/40 px-3 py-2 text-[12.5px]"
            >
              <input
                type="checkbox"
                className="accent-violet-soft"
                checked={selected.has(r.runId)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(r.runId);
                  else next.delete(r.runId);
                  setSelected(next);
                }}
              />
              <span className="min-w-0 flex-1 truncate text-chalk-100">{r.task}</span>
              <span className="mono shrink-0 text-[10.5px] text-chalk-400">{r.branchName}</span>
              {p ? (
                <span
                  className={`shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold ${
                    p.clean ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/10 text-rose-300"
                  }`}
                >
                  {p.clean ? "clean" : "conflicts"}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {preview && !preview.allClean ? (
        <div className="mt-2 rounded-[10px] border border-rose-400/25 bg-rose-500/[0.06] px-3 py-1.5 text-[11px] text-rose-300">
          {preview.results
            .filter((x) => !x.clean)
            .map((x) => `${x.branch}: ${x.conflictedFiles.join(", ") || x.note}`)
            .join(" · ")}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null || selected.size === 0}
          onClick={() =>
            run("preview", async () => setPreview(await api.previewIntegration(ids())))
          }
          className="h-8 rounded-[10px] bg-coal-500 px-3 text-[12px] font-semibold text-chalk-100 transition hover:bg-coal-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "preview" ? "Previewing…" : "Preview merges"}
        </button>
        <input
          value={into}
          onChange={(e) => setInto(e.target.value)}
          placeholder="integration/branch"
          className="mono h-8 w-[200px] rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 text-[11.5px] text-chalk-100 focus:border-violet-soft/50 focus:outline-none"
        />
        <button
          type="button"
          disabled={busy !== null || selected.size === 0 || !into.trim()}
          onClick={() =>
            run("apply", async () => {
              const res = await api.applyIntegration(into.trim(), ids());
              setMsg(
                res.stoppedAt
                  ? `Stopped at ${res.stoppedAt} (conflicts). Resolve in ${res.worktreePath}.`
                  : `Integrated into ${res.integrationBranch}. Review it - main is untouched.`,
              );
              setFinishable(res.stoppedAt ? null : res.integrationBranch);
            })
          }
          className="h-8 rounded-[10px] bg-emerald-500/15 px-3 text-[12px] font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "apply" ? "Integrating…" : "Integrate selected"}
        </button>
        {finishable ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              // Explicit, spelled-out confirm: this is the only place the
              // product touches main - locally, never pushed (P7b).
              if (
                !window.confirm(
                  `Merge "${finishable}" into main now?\n\nThis runs a LOCAL git merge of the reviewed integration branch into main. Nothing is pushed. Refused if the tree is dirty, the integration is partial, or a policy objects.`,
                )
              ) {
                return;
              }
              void run("finish", async () => {
                const r = await api.finishIntegration(finishable);
                setMsg(
                  `Merged ${r.integrationBranch} into ${r.intoBranch} @ ${r.mergedSha.slice(0, 10)} (local only - not pushed).`,
                );
                setFinishable(null);
              });
            }}
            className="h-8 rounded-[10px] bg-violet-soft/15 px-3 text-[12px] font-semibold text-violet-soft transition hover:bg-violet-soft/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "finish" ? "Merging…" : "Complete merge to main"}
          </button>
        ) : null}
        {msg ? <span className="text-[11px] text-emerald-400">{msg}</span> : null}
        {error ? <span className="text-[11px] text-rose-300">{error}</span> : null}
      </div>
    </section>
  );
}
