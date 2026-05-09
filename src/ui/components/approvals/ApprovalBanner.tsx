import { useState } from "react";
import { ShieldQuestion, Check, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ApprovalRequest } from "../../lib/types.js";

type Props = {
  runId: string;
  approval: ApprovalRequest;
  onResolved: (a: ApprovalRequest) => void;
};

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

  return (
    <div className="rounded border border-amaco-accent/40 bg-amaco-accent-soft/40 p-3">
      <div className="flex items-start gap-3">
        <ShieldQuestion
          className="mt-0.5 h-4 w-4 text-amaco-accent"
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <div className="text-[12.5px] font-medium text-amaco-fg">
            Awaiting your decision
          </div>
          <div className="mt-1 text-[12px] text-amaco-fg-dim">
            <span className="amaco-mono">{approval.agentId}</span> at stage{" "}
            <span className="amaco-mono">{approval.stageId}</span> asked Amaco
            to pause before continuing.
          </div>
          {approval.reason ? (
            <div className="mt-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5 text-[12.5px] text-amaco-fg">
              {approval.reason}
            </div>
          ) : null}
          {approval.requestedAction ? (
            <div className="mt-1 text-[11.5px] text-amaco-fg-muted">
              Requested action:{" "}
              <span className="amaco-mono text-amaco-fg-dim">
                {approval.requestedAction}
              </span>
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
            <span className="ml-auto text-[10.5px] text-amaco-fg-muted">
              risk: {approval.riskLevel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
