import { useState } from "react";
import { ShieldQuestion, ShieldAlert, Check, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ApprovalRequest } from "../../lib/types.js";

type Props = {
  runId: string;
  approval: ApprovalRequest;
  onResolved: (a: ApprovalRequest) => void;
};

const RISK_PILL: Record<ApprovalRequest["riskLevel"], string> = {
  low: "border-amaco-fg-muted/40 text-amaco-fg-dim",
  medium: "border-amaco-accent/50 text-amaco-accent",
  // High risk warns clearly without going panic-red. Failure red is reserved
  // for actually-broken runs.
  high: "border-amaco-warn/60 text-amaco-warn",
};

const RISK_LABEL: Record<ApprovalRequest["riskLevel"], string> = {
  low: "low risk",
  medium: "medium risk",
  high: "high risk",
};

function describeSource(approval: ApprovalRequest): string {
  if (approval.source === "policy") {
    return "Project policy requires approval at this stage.";
  }
  if (approval.alsoRequiredByPolicy) {
    return `The ${approval.roleId} agent requested your approval — and project policy also requires it at this stage.`;
  }
  return `The ${approval.roleId} agent requested your approval.`;
}

export function ApprovalBanner({ runId, approval, onResolved }: Props) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      const updated =
        kind === "approve"
          ? await api.approveApproval({
              runId,
              approvalId: approval.id,
              note: note.trim() || undefined,
            })
          : await api.rejectApproval({
              runId,
              approvalId: approval.id,
              note: note.trim() || undefined,
            });
      onResolved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const isHigh = approval.riskLevel === "high";
  const Icon = isHigh ? ShieldAlert : ShieldQuestion;
  const containerBorder = isHigh
    ? "border-amaco-warn/50 bg-amaco-warn/5"
    : "border-amaco-accent/40 bg-amaco-accent-soft/40";
  const iconColor = isHigh ? "text-amaco-warn" : "text-amaco-accent";

  return (
    <div className={`rounded border ${containerBorder} p-3`}>
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-4 w-4 ${iconColor}`}
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-medium text-amaco-fg">
              Awaiting your decision
            </span>
            <span
              className={`amaco-mono rounded border px-1.5 py-0.5 text-[10.5px] ${RISK_PILL[approval.riskLevel]}`}
            >
              {RISK_LABEL[approval.riskLevel]}
            </span>
            <span
              className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-muted"
              title={
                approval.source === "policy"
                  ? "Required by project config"
                  : "Requested by the agent"
              }
            >
              {approval.source === "policy" ? "policy" : "agent-requested"}
            </span>
            <span className="amaco-mono ml-auto text-[10.5px] text-amaco-fg-muted">
              {approval.stageId}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-amaco-fg-dim">
            {describeSource(approval)}
          </div>

          {approval.requestedAction ? (
            <div className="mt-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
                requested action
              </div>
              <div className="mt-0.5 text-[12.5px] text-amaco-fg">
                {approval.requestedAction}
              </div>
            </div>
          ) : null}

          {approval.reason ? (
            <div className="mt-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-amaco-fg-muted">
                reason
              </div>
              <div className="mt-0.5 text-[12.5px] text-amaco-fg">
                {approval.reason}
              </div>
            </div>
          ) : null}

          {approval.sourceArtifactPath ? (
            <div className="mt-1 text-[11.5px] text-amaco-fg-muted">
              Source artifact:{" "}
              <span className="amaco-mono text-amaco-fg-dim">
                {approval.sourceArtifactPath}
              </span>
            </div>
          ) : null}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional decision note (recorded in approvals.json)"
            rows={2}
            className="mt-2 block w-full resize-y rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5 text-[12.5px] text-amaco-fg placeholder-amaco-fg-muted"
          />
          {error ? (
            <div className="mt-1.5 text-[12px] text-amaco-fail">{error}</div>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => decide("approve")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded border border-amaco-success/40 bg-amaco-success/10 px-2.5 py-1 text-[12px] text-amaco-success hover:bg-amaco-success/15 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={() => decide("reject")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded border border-amaco-warn/40 bg-amaco-warn/10 px-2.5 py-1 text-[12px] text-amaco-warn hover:bg-amaco-warn/15 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
