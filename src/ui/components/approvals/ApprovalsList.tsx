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
            <div className="flex items-center gap-2 text-[12px]">
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
              <span className="ml-auto amaco-mono text-[11px] text-amaco-fg-muted">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </div>
            {a.reason ? (
              <div className="mt-1 text-[12px] text-amaco-fg">{a.reason}</div>
            ) : null}
            {a.decisionNote ? (
              <div className="mt-1 text-[11.5px] text-amaco-fg-dim">
                note: {a.decisionNote}
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
