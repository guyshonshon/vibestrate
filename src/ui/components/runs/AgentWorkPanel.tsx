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
import type { RoleWorkReport, RoleWorkRow } from "../../lib/types.js";

type Props = {
  runId: string;
  onOpenArtifact: (relPath: string) => void;
};

export function RoleWorkPanel({ runId, onOpenArtifact }: Props) {
  const [report, setReport] = useState<RoleWorkReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.getRoleWork(runId);
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
      <div className="rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-3 py-2 text-[12px] text-vibestrate-fail">
        {error}
      </div>
    );
  }
  if (!report) {
    return (
      <div className="px-3 py-2 text-[12px] text-vibestrate-fg-muted">
        Loading agent work…
      </div>
    );
  }

  return (
    <div className="rounded border border-vibestrate-border bg-vibestrate-panel/30">
      <header className="flex items-center gap-2 border-b border-vibestrate-border px-3 py-1.5">
        <Layers className="h-3.5 w-3.5 text-vibestrate-accent" strokeWidth={1.5} />
        <span className="text-[12px] font-medium text-vibestrate-fg">Agent work</span>
        <span className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-muted">
          best effort
        </span>
        <span className="ml-auto vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
          {(report.totalDurationMs / 1000).toFixed(1)}s total
          {report.totalCostUsd !== null
            ? ` · $${report.totalCostUsd.toFixed(4)}`
            : ""}
        </span>
      </header>
      {report.notice ? (
        <div className="border-b border-vibestrate-border bg-vibestrate-panel-2/50 px-3 py-1 text-[10.5px] text-vibestrate-fg-muted">
          {report.notice}
        </div>
      ) : null}
      {report.rows.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-vibestrate-fg-muted">
          No agents have completed yet.
        </div>
      ) : (
        <ul className="divide-y divide-vibestrate-border">
          {report.rows.map((r, idx) => (
            <Row
              key={`${r.roleId}-${r.startedAt}-${idx}`}
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
  row: RoleWorkRow;
  onOpenArtifact: (relPath: string) => void;
}) {
  const ok = row.exitCode === 0;
  return (
    <li className="px-3 py-2.5 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        {ok ? (
          <CheckCircle2
            className="h-3.5 w-3.5 text-vibestrate-success"
            strokeWidth={1.5}
          />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-vibestrate-fail" strokeWidth={1.5} />
        )}
        <span className="font-medium text-vibestrate-fg">{row.roleId}</span>
        <span className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-muted">
          {row.stage}
        </span>
        <span className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-muted">
          {row.providerId}
        </span>
        <span className="vibestrate-mono rounded border border-vibestrate-border px-1 text-[10px] text-vibestrate-fg-muted">
          {row.providerType}
        </span>
        <span className="ml-auto vibestrate-mono inline-flex items-center gap-1 text-[10.5px] text-vibestrate-fg-muted">
          <Clock className="h-3 w-3" strokeWidth={1.5} />
          {(row.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-vibestrate-fg-dim">
        {row.filesChangedAfter !== null ? (
          <span>
            files Δ{" "}
            <span className="vibestrate-mono text-vibestrate-fg">
              {row.filesChangedAfter}
            </span>
          </span>
        ) : null}
        {row.diffInsertionsAfter !== null ? (
          <span>
            +<span className="vibestrate-mono text-vibestrate-success">
              {row.diffInsertionsAfter}
            </span>
          </span>
        ) : null}
        {row.diffDeletionsAfter !== null ? (
          <span>
            −<span className="vibestrate-mono text-vibestrate-fail">
              {row.diffDeletionsAfter}
            </span>
          </span>
        ) : null}
        {row.validationSummary ? (
          <span>
            validation{" "}
            <span className="vibestrate-mono text-vibestrate-fg">
              {row.validationSummary.passed}/{row.validationSummary.total}
            </span>
            {row.validationSummary.failed > 0 ? (
              <span className="ml-1 inline-flex items-center gap-0.5 text-vibestrate-warn">
                <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                {row.validationSummary.failed} failed
              </span>
            ) : null}
          </span>
        ) : null}
        {row.reviewDecision ? (
          <span>
            review{" "}
            <span className="vibestrate-mono text-vibestrate-fg">{row.reviewDecision}</span>
          </span>
        ) : null}
        {row.verificationDecision ? (
          <span>
            verification{" "}
            <span className="vibestrate-mono text-vibestrate-fg">
              {row.verificationDecision}
            </span>
          </span>
        ) : null}
      </div>
      {row.skillsAttached.length > 0 ? (
        <div className="mt-1.5 text-[10.5px] text-vibestrate-fg-muted">
          skills attached:{" "}
          <span className="text-vibestrate-fg-dim">
            {row.skillsAttached.join(", ")}
          </span>
          {row.skillsRequested.length > 0 ? (
            <span>
              {" "}· requested:{" "}
              <span className="text-vibestrate-fg-dim">
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
              className="inline-flex items-center gap-1 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:border-vibestrate-accent/40"
              title={a.path}
            >
              <FileText className="h-3 w-3" strokeWidth={1.5} />
              {a.kind}
            </button>
          ))}
        </div>
      ) : null}
      {row.notes.length > 0 ? (
        <ul className="mt-1.5 list-disc pl-5 text-[11px] text-vibestrate-fg-dim">
          {row.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
