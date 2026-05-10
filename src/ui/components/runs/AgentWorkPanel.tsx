import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  XCircle,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { AgentWorkReport, AgentWorkRow } from "../../lib/types.js";

type Props = {
  runId: string;
  onOpenArtifact: (relPath: string) => void;
};

export function AgentWorkPanel({ runId, onOpenArtifact }: Props) {
  const [report, setReport] = useState<AgentWorkReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.getAgentWork(runId);
        if (!cancelled) setReport(r);
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

  if (error) {
    return (
      <div className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-3 py-2 text-[12px] text-amaco-fail">
        {error}
      </div>
    );
  }
  if (!report) {
    return (
      <div className="px-3 py-2 text-[12px] text-amaco-fg-muted">
        Loading agent work…
      </div>
    );
  }

  return (
    <div className="rounded border border-amaco-border bg-amaco-panel/30">
      <header className="flex items-center gap-2 border-b border-amaco-border px-3 py-1.5">
        <Layers className="h-3.5 w-3.5 text-amaco-accent" strokeWidth={1.5} />
        <span className="text-[12px] font-medium text-amaco-fg">Agent work</span>
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          best effort
        </span>
        <span className="ml-auto amaco-mono text-[10.5px] text-amaco-fg-muted">
          {(report.totalDurationMs / 1000).toFixed(1)}s total
          {report.totalCostUsd !== null
            ? ` · $${report.totalCostUsd.toFixed(4)}`
            : ""}
        </span>
      </header>
      {report.notice ? (
        <div className="border-b border-amaco-border bg-amaco-panel-2/50 px-3 py-1 text-[10.5px] text-amaco-fg-muted">
          {report.notice}
        </div>
      ) : null}
      {report.rows.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-amaco-fg-muted">
          No agents have completed yet.
        </div>
      ) : (
        <ul className="divide-y divide-amaco-border">
          {report.rows.map((r, idx) => (
            <Row
              key={`${r.agentId}-${r.startedAt}-${idx}`}
              row={r}
              onOpenArtifact={onOpenArtifact}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  row,
  onOpenArtifact,
}: {
  row: AgentWorkRow;
  onOpenArtifact: (relPath: string) => void;
}) {
  const ok = row.exitCode === 0;
  return (
    <li className="px-3 py-2.5 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        {ok ? (
          <CheckCircle2
            className="h-3.5 w-3.5 text-amaco-success"
            strokeWidth={1.5}
          />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-amaco-fail" strokeWidth={1.5} />
        )}
        <span className="font-medium text-amaco-fg">{row.agentId}</span>
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          {row.stage}
        </span>
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          {row.providerId}
        </span>
        <span className="amaco-mono rounded border border-amaco-border px-1 text-[10px] text-amaco-fg-muted">
          {row.providerType}
        </span>
        <span className="ml-auto amaco-mono inline-flex items-center gap-1 text-[10.5px] text-amaco-fg-muted">
          <Clock className="h-3 w-3" strokeWidth={1.5} />
          {(row.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-amaco-fg-dim">
        {row.filesChangedAfter !== null ? (
          <span>
            files Δ{" "}
            <span className="amaco-mono text-amaco-fg">
              {row.filesChangedAfter}
            </span>
          </span>
        ) : null}
        {row.diffInsertionsAfter !== null ? (
          <span>
            +<span className="amaco-mono text-amaco-success">
              {row.diffInsertionsAfter}
            </span>
          </span>
        ) : null}
        {row.diffDeletionsAfter !== null ? (
          <span>
            −<span className="amaco-mono text-amaco-fail">
              {row.diffDeletionsAfter}
            </span>
          </span>
        ) : null}
        {row.validationSummary ? (
          <span>
            validation{" "}
            <span className="amaco-mono text-amaco-fg">
              {row.validationSummary.passed}/{row.validationSummary.total}
            </span>
            {row.validationSummary.failed > 0 ? (
              <span className="ml-1 inline-flex items-center gap-0.5 text-amaco-warn">
                <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                {row.validationSummary.failed} failed
              </span>
            ) : null}
          </span>
        ) : null}
        {row.reviewDecision ? (
          <span>
            review{" "}
            <span className="amaco-mono text-amaco-fg">{row.reviewDecision}</span>
          </span>
        ) : null}
        {row.verificationDecision ? (
          <span>
            verification{" "}
            <span className="amaco-mono text-amaco-fg">
              {row.verificationDecision}
            </span>
          </span>
        ) : null}
      </div>
      {row.skillsAttached.length > 0 ? (
        <div className="mt-1.5 text-[10.5px] text-amaco-fg-muted">
          skills attached:{" "}
          <span className="text-amaco-fg-dim">
            {row.skillsAttached.join(", ")}
          </span>
          {row.skillsRequested.length > 0 ? (
            <span>
              {" "}· requested:{" "}
              <span className="text-amaco-fg-dim">
                {row.skillsRequested.join(", ")}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
      {row.artifacts.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {row.artifacts.map((a) => (
            <button
              key={`${a.kind}-${a.path}`}
              type="button"
              onClick={() => onOpenArtifact(a.path)}
              className="inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[10.5px] text-amaco-fg-dim hover:border-amaco-accent/40"
              title={a.path}
            >
              <FileText className="h-3 w-3" strokeWidth={1.5} />
              {a.kind}
            </button>
          ))}
        </div>
      ) : null}
      {row.notes.length > 0 ? (
        <ul className="mt-1.5 list-disc pl-5 text-[11px] text-amaco-fg-dim">
          {row.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
