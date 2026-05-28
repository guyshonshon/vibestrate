import { Check, History, Hourglass, X } from "lucide-react";
import type { ApprovalRequest } from "../../lib/types.js";
import { navigate } from "../../app/App.js";

const STATUS_ICON = {
  pending: Hourglass,
  approved: Check,
  rejected: X,
  expired: X,
} as const;

const STATUS_COLOR: Record<ApprovalRequest["status"], string> = {
  pending: "text-vibestrate-accent",
  approved: "text-vibestrate-success",
  rejected: "text-vibestrate-warn",
  expired: "text-vibestrate-fg-muted",
};

const RISK_PILL: Record<ApprovalRequest["riskLevel"], string> = {
  low: "border-vibestrate-fg-muted/40 text-vibestrate-fg-dim",
  medium: "border-vibestrate-accent/50 text-vibestrate-accent",
  high: "border-vibestrate-warn/60 text-vibestrate-warn",
};

export function ApprovalsList({
  approvals,
  runId,
}: {
  approvals: ApprovalRequest[];
  runId?: string;
}) {
  if (approvals.length === 0) {
    return (
      <div className="text-[12px] text-vibestrate-fg-muted">
        No approval requests for this run.
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {approvals.map((a) => {
        const Icon = STATUS_ICON[a.status];
        return (
          <li
            key={a.id}
            className="rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Icon
                className={`h-3.5 w-3.5 ${STATUS_COLOR[a.status]}`}
                strokeWidth={1.5}
              />
              <span className={`vibestrate-mono ${STATUS_COLOR[a.status]}`}>
                {a.status}
              </span>
              <span className="vibestrate-mono text-vibestrate-fg-dim">{a.stageId}</span>
              <span className="vibestrate-mono text-vibestrate-fg-dim">·</span>
              <span className="vibestrate-mono text-vibestrate-fg-dim">{a.roleId}</span>
              <span
                className={`vibestrate-mono rounded border px-1 text-[10.5px] ${RISK_PILL[a.riskLevel]}`}
              >
                {a.riskLevel}
              </span>
              <span className="vibestrate-mono rounded border border-vibestrate-border bg-vibestrate-panel px-1 text-[10.5px] text-vibestrate-fg-muted">
                {a.source === "policy"
                  ? "policy"
                  : a.alsoRequiredByPolicy
                    ? "agent + policy"
                    : "agent"}
              </span>
              <span className="ml-auto vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </div>
            {a.requestedAction ? (
              <div className="mt-1.5 text-[12px] text-vibestrate-fg">
                <span className="text-vibestrate-fg-muted">requested:</span>{" "}
                {a.requestedAction}
              </div>
            ) : null}
            {a.reason ? (
              <div className="mt-1 text-[11.5px] text-vibestrate-fg-dim">
                <span className="text-vibestrate-fg-muted">reason:</span> {a.reason}
              </div>
            ) : null}
            {a.sourceArtifactPath ? (
              <div className="mt-1 text-[10.5px] text-vibestrate-fg-muted">
                source artifact:{" "}
                <span className="vibestrate-mono text-vibestrate-fg-dim">
                  {a.sourceArtifactPath}
                </span>
              </div>
            ) : null}
            {a.decisionNote ? (
              <div className="mt-1 text-[11.5px] text-vibestrate-fg-dim">
                <span className="text-vibestrate-fg-muted">note:</span>{" "}
                {a.decisionNote}
              </div>
            ) : null}
            {a.resolvedAt ? (
              <div className="mt-1 vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
                resolved {new Date(a.resolvedAt).toLocaleString()} by{" "}
                {a.resolvedBy ?? "local-user"}
              </div>
            ) : null}
            <div className="mt-1 flex items-center gap-2 vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
              <span>id: {a.id}</span>
              {runId ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      kind: "run",
                      runId,
                      tab: "replay",
                      replayFocus: {
                        kind: "match",
                        match: { kind: "approval", id: a.id },
                      },
                    })
                  }
                  className="ml-auto inline-flex items-center gap-1 rounded border border-vibestrate-border bg-vibestrate-panel-2 px-1.5 py-0.5 text-vibestrate-fg-dim hover:bg-vibestrate-panel"
                  title="Jump to this approval in the read-only Replay timeline"
                >
                  <History className="h-3 w-3" strokeWidth={1.5} />
                  Replay
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
