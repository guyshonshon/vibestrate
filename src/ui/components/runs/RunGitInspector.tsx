import { useEffect, useState } from "react";
import { GitBranch, GitCommit } from "lucide-react";
import { api } from "../../lib/api.js";
import type { GitHistory, GitStatus } from "../../lib/types.js";

export function RunGitInspector({ runId }: { runId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [history, setHistory] = useState<GitHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, h] = await Promise.all([
          api.getRunGitStatus(runId),
          api.getRunGitHistory(runId, 10),
        ]);
        if (!cancelled) {
          setStatus(s);
          setHistory(h);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const i = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [runId]);

  if (error) return <div className="text-[12px] text-amaco-fail">{error}</div>;
  if (!status)
    return <div className="text-[12px] text-amaco-fg-muted">Loading…</div>;
  if (!status.available) {
    return (
      <div className="rounded border border-amaco-warn/40 bg-amaco-warn/10 px-2.5 py-2 text-[12px] text-amaco-warn">
        Worktree git status unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[12px]">
      <div className="rounded border border-amaco-border bg-amaco-panel-2 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
            <GitBranch className="h-3 w-3" strokeWidth={1.5} />
            {status.branch ?? "(detached)"}
          </span>
          <span
            className={`amaco-mono rounded border px-1.5 py-0.5 text-[10.5px] ${
              status.isDirty
                ? "border-amaco-warn/40 text-amaco-warn"
                : "border-amaco-success/40 text-amaco-success"
            }`}
          >
            {status.isDirty ? `dirty (${status.changedFiles.length})` : "clean"}
          </span>
        </div>
        {status.headHash ? (
          <div className="mt-1 amaco-mono text-[10.5px] text-amaco-fg-muted">
            {status.headHash} · {status.headSubject}
          </div>
        ) : null}
        {status.changedFiles.length > 0 ? (
          <ul className="mt-1.5">
            {status.changedFiles.map((f) => (
              <li
                key={f.path}
                className="flex items-baseline gap-2 amaco-mono text-[11.5px]"
              >
                <span className="w-7 shrink-0 text-amaco-fg-muted">
                  {f.status}
                </span>
                <span className="truncate">{f.path}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {history && history.commits.length > 0 ? (
        <div className="rounded border border-amaco-border bg-amaco-panel-2">
          <header className="flex items-center gap-1.5 border-b border-amaco-border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-amaco-fg-muted">
            <GitCommit className="h-3 w-3" strokeWidth={1.5} />
            Commits
          </header>
          <ul className="divide-y divide-amaco-border">
            {history.commits.map((c) => (
              <li key={c.hash} className="px-2.5 py-1 text-[11.5px]">
                <div className="flex items-baseline gap-2">
                  <span className="amaco-mono w-14 shrink-0 text-amaco-fg-muted">
                    {c.shortHash}
                  </span>
                  <span className="truncate text-amaco-fg">{c.subject}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
