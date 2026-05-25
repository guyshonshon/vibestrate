import { useEffect, useState } from "react";
import { GitBranch, GitCommit } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  GitHistory,
  GitStatus,
  RunState,
} from "../../lib/types.js";
import { FreshnessIndicator } from "../../components/codebase/FreshnessIndicator.js";
import { useCodebaseEvents } from "../../lib/useCodebaseEvents.js";

type Props = {
  initialRunId?: string | null;
  onSelectRun: (runId: string) => void;
};

export function GitPage({ initialRunId, onSelectRun }: Props) {
  const [projectStatus, setProjectStatus] = useState<GitStatus | null>(null);
  const [projectHistory, setProjectHistory] = useState<GitHistory | null>(null);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [runId, setRunId] = useState<string | null>(initialRunId ?? null);
  const [runStatus, setRunStatus] = useState<GitStatus | null>(null);
  const [runHistory, setRunHistory] = useState<GitHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectFresh = useCodebaseEvents("/api/project/events/stream");
  const runFresh = useCodebaseEvents(
    runId ? `/api/runs/${encodeURIComponent(runId)}/codebase/events/stream` : null,
  );

  function loadProject() {
    Promise.all([
      api.getProjectGitStatus(),
      api.getProjectGitHistory(20),
      api.listRuns(),
    ])
      .then(([s, h, r]) => {
        setProjectStatus(s);
        setProjectHistory(h);
        setRuns(r);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    loadProject();
  }, []);

  // Auto-refetch on incoming events.
  useEffect(() => {
    if (!projectFresh.lastEvent) return;
    loadProject();
  }, [projectFresh.lastEvent]);

  function loadRun() {
    if (!runId) {
      setRunStatus(null);
      setRunHistory(null);
      return;
    }
    Promise.all([
      api.getRunGitStatus(runId).catch(() => null),
      api.getRunGitHistory(runId, 20).catch(() => null),
    ]).then(([s, h]) => {
      setRunStatus(s);
      setRunHistory(h);
    });
  }

  useEffect(loadRun, [runId]);

  useEffect(() => {
    if (!runFresh.lastEvent) return;
    loadRun();
  }, [runFresh.lastEvent]);

  return (
    <div className="relative z-10 mx-auto max-w-[1280px] px-6 pt-5 pb-12">
      <section className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="eyebrow">Git</span>
          <span className="text-fog-500">·</span>
          <h1 className="text-[15px] font-semibold tracking-tight text-fog-100">
            Project + per-run worktrees
          </h1>
          <span className="text-[11.5px] text-fog-500">
            local-only · no fetch / push / merge
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FreshnessIndicator freshness={projectFresh} onRefresh={loadProject} />
          {runId ? (
            <FreshnessIndicator freshness={runFresh} onRefresh={loadRun} />
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="mb-6">
        <SectionTitle>Project</SectionTitle>
        <StatusBlock status={projectStatus} label="project" />
        <HistoryBlock history={projectHistory} />
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <SectionTitle>Run worktree</SectionTitle>
          <select
            value={runId ?? ""}
            onChange={(e) => setRunId(e.target.value || null)}
            className="ml-auto rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[11.5px] text-amaco-fg-dim"
          >
            <option value="">— pick a run —</option>
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {r.runId} · {r.task}
              </option>
            ))}
          </select>
          {runId ? (
            <button
              type="button"
              onClick={() => onSelectRun(runId)}
              className="rounded border border-amaco-border px-2 py-0.5 text-[11px] text-amaco-fg-dim hover:bg-amaco-panel-2"
            >
              Open run →
            </button>
          ) : null}
        </div>
        {runId ? (
          <>
            <StatusBlock status={runStatus} label={`run:${runId}`} />
            <HistoryBlock history={runHistory} />
          </>
        ) : (
          <div className="rounded border border-amaco-border bg-amaco-panel-2 px-3 py-2 text-[12px] text-amaco-fg-muted">
            Pick a run to view its worktree status and history.
          </div>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
      {children}
    </h2>
  );
}

function StatusBlock({
  status,
  label,
}: {
  status: GitStatus | null;
  label: string;
}) {
  if (!status) {
    return (
      <div className="rounded border border-amaco-border bg-amaco-panel-2 px-3 py-2 text-[12px] text-amaco-fg-muted">
        Loading {label}…
      </div>
    );
  }
  if (!status.available) {
    return (
      <div className="rounded border border-amaco-warn/40 bg-amaco-warn/10 px-3 py-2 text-[12px] text-amaco-warn">
        Not a git repository, or git not available.
      </div>
    );
  }
  return (
    <div className="mb-3 rounded border border-amaco-border bg-amaco-panel-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
          <GitBranch className="h-3 w-3" strokeWidth={1.5} />
          {status.branch ?? "(detached)"}
        </span>
        {status.upstream ? (
          <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-muted">
            ↑{status.ahead ?? 0} ↓{status.behind ?? 0} {status.upstream}
          </span>
        ) : null}
        <span
          className={`amaco-mono rounded border px-1.5 py-0.5 text-[10.5px] ${
            status.isDirty
              ? "border-amaco-warn/40 text-amaco-warn"
              : "border-amaco-success/40 text-amaco-success"
          }`}
        >
          {status.isDirty ? `dirty (${status.changedFiles.length})` : "clean"}
        </span>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          {status.headHash} · {status.headSubject}
        </span>
      </div>
      {status.changedFiles.length > 0 ? (
        <ul className="mt-2 max-h-40 overflow-y-auto">
          {status.changedFiles.map((f) => (
            <li
              key={f.path}
              className="flex items-baseline gap-2 amaco-mono text-[11.5px]"
            >
              <span className="w-7 shrink-0 text-amaco-fg-muted">{f.status}</span>
              <span className="truncate">{f.path}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 amaco-mono text-[10.5px] text-amaco-fg-muted">
        {status.worktreePath}
      </div>
    </div>
  );
}

function HistoryBlock({ history }: { history: GitHistory | null }) {
  if (!history || !history.available) {
    return null;
  }
  if (history.commits.length === 0) {
    if (!history.baseRef) return null;
    return (
      <div className="rounded border border-amaco-border bg-amaco-panel-2 px-3 py-2 text-[12px] text-amaco-fg-muted">
        No task-specific commits since {history.baseRef}.
      </div>
    );
  }
  return (
    <div className="rounded border border-amaco-border bg-amaco-panel-2">
      <header className="flex items-center gap-2 border-b border-amaco-border px-3 py-1 text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
        <GitCommit className="h-3 w-3" strokeWidth={1.5} />
        {history.baseRef ? `Task commits since ${history.baseRef}` : "Recent commits"}
        {history.truncated ? <span>· bounded</span> : null}
      </header>
      <ul className="divide-y divide-amaco-border">
        {history.commits.map((c) => (
          <li key={c.hash} className="px-3 py-1.5 text-[11.5px]">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="amaco-mono w-16 shrink-0 text-amaco-fg-muted">
                {c.shortHash}
              </span>
              <span className="truncate text-amaco-fg">{c.subject}</span>
              <span className="ml-auto amaco-mono text-[10.5px] text-amaco-fg-muted">
                {c.author} · {formatDate(c.date)}
              </span>
            </div>
            {c.refs.length > 0 ? (
              <div className="amaco-mono mt-0.5 text-[10.5px] text-amaco-fg-muted">
                {c.refs.join(", ")}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
