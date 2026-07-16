import { useState } from "react";
import { Check, X, MessageSquareText, Send, MessagesSquare } from "lucide-react";
import { api } from "../../lib/api.js";
import type { ApprovalRequest } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { HeroCard, type HeroTone } from "../design/HeroCard.js";

type Props = {
  runId: string;
  approval: ApprovalRequest;
  onResolved: (a: ApprovalRequest) => void;
  /** Opens the consult dock pre-seeded with this approval (advisory). */
  onDiscuss?: (a: ApprovalRequest) => void;
  /** Demo/deep-link: open with the guidance composer already showing. */
  defaultMode?: "idle" | "changes";
};

const RISK_TONE: Record<ApprovalRequest["riskLevel"], HeroTone> = {
  low: "violet",
  medium: "amber",
  high: "rose",
};

function describeSource(a: ApprovalRequest): string {
  if (a.source === "policy") return "Project policy pauses the run at this stage.";
  if (a.alsoRequiredByPolicy)
    return `The ${a.roleId} agent asked for your call, and policy requires it here.`;
  return `The ${a.roleId} agent asked for your call before continuing.`;
}

export function ApprovalBanner({ runId, approval, onResolved, onDiscuss, defaultMode }: Props) {
  const [mode, setMode] = useState<"idle" | "changes">(defaultMode ?? "idle");
  const [guidance, setGuidance] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "changes" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRequestChanges = approval.source !== "policy";
  const tone = RISK_TONE[approval.riskLevel];

  async function run(
    kind: "approve" | "reject" | "changes",
    fn: () => Promise<ApprovalRequest>,
  ) {
    setBusy(kind);
    setError(null);
    try {
      onResolved(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const approve = () =>
    run("approve", () => api.approveApproval({ runId, approvalId: approval.id }));
  const reject = () =>
    run("reject", () => api.rejectApproval({ runId, approvalId: approval.id }));
  const sendChanges = () =>
    run("changes", () =>
      api.requestChangesApproval({ runId, approvalId: approval.id, guidance: guidance.trim() }),
    );

  function discuss() {
    if (onDiscuss) {
      onDiscuss(approval);
      return;
    }
    // Open the global consult dock seeded with this gate's context (advisory -
    // consult never resolves the gate; it just helps you decide).
    const q = `The ${approval.roleId} agent paused at ${approval.stageId} and asked: "${approval.requestedAction}". Reason: ${approval.reason}. How should I respond?`;
    window.dispatchEvent(
      new CustomEvent("vibestrate:consult-open", { detail: { question: q } }),
    );
  }

  return (
    <HeroCard
      size="md"
      tone={tone}
      overline={approval.source === "policy" ? "policy gate" : "agent-requested"}
      status="your turn"
      statusSub={`${approval.riskLevel} risk`}
      title={approval.requestedAction || `Approve continuing past ${approval.stageId}.`}
      sub={describeSource(approval)}
      actions={
        <span className="mono text-[11px] text-chalk-400">{approval.stageId}</span>
      }
      footer={
        mode === "changes" ? (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={busy !== null || !guidance.trim()}
              iconLeft={<Send className="h-3.5 w-3.5" strokeWidth={1.9} />}
              onClick={sendChanges}
            >
              {busy === "changes" ? "Sending" : "Send guidance"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setMode("idle");
                setGuidance("");
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={busy !== null}
              iconLeft={<Check className="h-3.5 w-3.5" strokeWidth={1.9} />}
              onClick={approve}
            >
              {busy === "approve" ? "Approving" : "Approve"}
            </Button>
            {canRequestChanges ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                iconLeft={<MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.9} />}
                onClick={() => setMode("changes")}
              >
                Request changes
              </Button>
            ) : null}
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              iconLeft={<X className="h-3.5 w-3.5" strokeWidth={1.9} />}
              onClick={reject}
            >
              {busy === "reject" ? "Rejecting" : "Reject"}
            </Button>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 text-[12px] font-medium text-violet-soft hover:bg-violet-soft/10"
              onClick={discuss}
            >
              <MessagesSquare className="h-3.5 w-3.5" strokeWidth={1.9} />
              Discuss
            </button>
          </>
        )
      }
    >
      <div className="border-b border-[color:var(--line-soft)] px-4 py-3">
        {approval.reason ? (
          <p className="text-[12.5px] leading-snug text-chalk-300">{approval.reason}</p>
        ) : null}
        {approval.sourceArtifactPath ? (
          <p className="mt-2 text-[11px] text-chalk-400">
            from <span className="mono text-chalk-300">{approval.sourceArtifactPath}</span>
          </p>
        ) : null}
        {mode === "changes" ? (
          <textarea
            autoFocus
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="What should the agent change? It re-runs this stage with your guidance."
            rows={3}
            className="mt-3 block w-full resize-y rounded-[10px] border border-violet-soft/40 bg-coal-800 px-3 py-2 text-[12.5px] text-chalk-100 placeholder:text-chalk-400 focus:outline-none focus:ring-1 focus:ring-violet-soft/50"
          />
        ) : null}
        {error ? <p className="mt-2 text-[12px] text-rose-300">{error}</p> : null}
      </div>
    </HeroCard>
  );
}
