import { Check, X, Hourglass } from "lucide-react";
import type { ApprovalRequest } from "../../lib/types.js";

const STATUS_ICON = {
  pending: Hourglass,
  approved: Check,
  rejected: X,
  expired: X,
} as const;

const STATUS_COLOR: Record<ApprovalRequest["status"], string> = {
  pending: "text-amaco-accent",
  approved: "text-amaco-success",
  rejected: "text-amaco-warn",
  expired: "text-amaco-fg-muted",
};

const RISK_PILL: Record<ApprovalRequest["riskLevel"], string> = {
  low: "border-amaco-fg-muted/40 text-amaco-fg-dim",
  medium: "border-amaco-accent/50 text-amaco-accent",
  high: "border-amaco-warn/60 text-amaco-warn",
};

export function ApprovalsList({ approvals }: { approvals: ApprovalRequest[] }) {
  if (approvals.length === 0) {
    return (
      <div className="text-[12px] text-amaco-fg-muted">
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
            className="rounded border border-amaco-border bg-amaco-panel-2 p-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Icon
                className={`h-3.5 w-3.5 ${STATUS_COLOR[a.status]}`}
                strokeWidth={1.5}
              />
              <span className={`amaco-mono ${STATUS_COLOR[a.status]}`}>
                {a.status}
              </span>
              <span className="amaco-mono text-amaco-fg-dim">{a.stageId}</span>
              <span className="amaco-mono text-amaco-fg-dim">·</span>
              <span className="amaco-mono text-amaco-fg-dim">{a.agentId}</span>
              <span
                className={`amaco-mono rounded border px-1 text-[10.5px] ${RISK_PILL[a.riskLevel]}`}
              >
                {a.riskLevel}
              </span>
              <span className="amaco-mono rounded border border-amaco-border bg-amaco-panel px-1 text-[10.5px] text-amaco-fg-muted">
                {a.source === "policy"
                  ? "policy"
                  : a.alsoRequiredByPolicy
                    ? "agent + policy"
                    : "agent"}
              </span>
              <span className="ml-auto amaco-mono text-[10.5px] text-amaco-fg-muted">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </div>
            {a.requestedAction ? (
              <div className="mt-1.5 text-[12px] text-amaco-fg">
                <span className="text-amaco-fg-muted">requested:</span>{" "}
                {a.requestedAction}
              </div>
            ) : null}
            {a.reason ? (
              <div className="mt-1 text-[11.5px] text-amaco-fg-dim">
                <span className="text-amaco-fg-muted">reason:</span> {a.reason}
              </div>
            ) : null}
            {a.sourceArtifactPath ? (
              <div className="mt-1 text-[10.5px] text-amaco-fg-muted">
                source artifact:{" "}
                <span className="amaco-mono text-amaco-fg-dim">
                  {a.sourceArtifactPath}
                </span>
              </div>
            ) : null}
            {a.decisionNote ? (
              <div className="mt-1 text-[11.5px] text-amaco-fg-dim">
                <span className="text-amaco-fg-muted">note:</span>{" "}
                {a.decisionNote}
              </div>
            ) : null}
            {a.resolvedAt ? (
              <div className="mt-1 amaco-mono text-[10.5px] text-amaco-fg-muted">
                resolved {new Date(a.resolvedAt).toLocaleString()} by{" "}
                {a.resolvedBy ?? "local-user"}
              </div>
            ) : null}
            <div className="mt-1 amaco-mono text-[10.5px] text-amaco-fg-muted">
              id: {a.id}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
