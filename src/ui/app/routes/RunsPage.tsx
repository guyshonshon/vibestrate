import { useEffect, useState } from "react";
import { GitMerge, History } from "lucide-react";
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

      <IntegrationPanel />

      <div className="glass overflow-hidden mt-5">
        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-[12.5px] text-fog-400">
            {runs.length === 0 ? (
              <>
                No runs yet. Try{" "}
                <span className="mono text-fog-200">vibe run "your task"</span>{" "}
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

type MergeReady = { runId: string; task: string; branchName: string; taskId: string | null };
type PreviewRow = { branch: string; runId?: string; clean: boolean; conflictedFiles: string[]; note: string };

/**
 * Integration surface (Phase 5): preview real git merges of merge-ready run
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
    <section className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.03] p-4">
      <div className="flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-emerald-300" strokeWidth={1.7} />
        <span className="text-[13px] font-medium text-fog-100">
          Integrate merge-ready runs ({ready.length})
        </span>
        <span className="ml-2 text-[10.5px] text-fog-500">
          never main · never push
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {ready.map((r) => (
          <li key={r.runId} className="flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={selected.has(r.runId)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(r.runId);
                else next.delete(r.runId);
                setSelected(next);
              }}
            />
            <span className="text-fog-100 truncate max-w-[280px]">{r.task}</span>
            <span className="mono text-[10.5px] text-fog-500">{r.branchName}</span>
            {preview?.results.find((x) => x.runId === r.runId) ? (
              preview.results.find((x) => x.runId === r.runId)!.clean ? (
                <Chip tone="emerald">clean</Chip>
              ) : (
                <Chip tone="rose">conflicts</Chip>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {preview && !preview.allClean ? (
        <div className="mt-2 text-[11px] text-rose-300">
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
          className="h-7 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-[11.5px] text-fog-200 hover:bg-white/[0.06] disabled:opacity-50"
        >
          {busy === "preview" ? "Previewing…" : "Preview merges"}
        </button>
        <input
          value={into}
          onChange={(e) => setInto(e.target.value)}
          placeholder="integration/branch"
          className="h-7 w-[200px] rounded-md bg-white/[0.025] border border-white/[0.08] px-2.5 text-[11.5px] text-fog-100 mono focus:outline-none focus:border-emerald-400/35"
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
                  : `Integrated into ${res.integrationBranch}. Review it — main is untouched.`,
              );
            })
          }
          className="h-7 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2.5 text-[11.5px] text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {busy === "apply" ? "Integrating…" : "Integrate selected"}
        </button>
        {msg ? <span className="text-[11px] text-emerald-300">{msg}</span> : null}
        {error ? <span className="text-[11px] text-rose-300">{error}</span> : null}
      </div>
    </section>
  );
}
