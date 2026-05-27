import { z } from "zod";

export const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalRiskSchema = z.enum(["low", "medium", "high"]);
export type ApprovalRisk = z.infer<typeof approvalRiskSchema>;

export const approvalSourceSchema = z.enum(["agent", "policy"]);
export type ApprovalSource = z.infer<typeof approvalSourceSchema>;

export const approvalRequestSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stageId: z.string().min(1),
  roleId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: approvalStatusSchema,
  reason: z.string().nullable().default(null),
  prompt: z.string().nullable().default(null),
  sourceArtifactPath: z.string().nullable().default(null),
  requestedAction: z.string().nullable().default(null),
  riskLevel: approvalRiskSchema.default("medium"),
  // V0 default is 'agent' so existing approvals.json files round-trip cleanly.
  source: approvalSourceSchema.default("agent"),
  // True when both an agent emitted HUMAN_APPROVAL and the project policy
  // also required approval at this stage. Logged for transparency; the
  // approval itself is still a single record.
  alsoRequiredByPolicy: z.boolean().default(false),
  userMessage: z.string().nullable().default(null),
  resolvedAt: z.string().nullable().default(null),
  resolvedBy: z.string().nullable().default(null),
  decisionNote: z.string().nullable().default(null),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const approvalDecisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  decidedAt: z.string(),
  decidedBy: z.string().default("local-user"),
  note: z.string().nullable().default(null),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export type ApprovalGateSignal = {
  required: boolean;
  reason: string | null;
  riskLevel: ApprovalRisk;
  requestedAction: string | null;
};

// Case-sensitive marker so casual mentions in prose do not trigger the gate.
const REQUIRED_RE = /^\s*HUMAN_APPROVAL\s*:\s*REQUIRED\s*$/m;
const REASON_RE = /^\s*HUMAN_APPROVAL_REASON\s*:\s*(.+)$/m;
const RISK_RE = /^\s*HUMAN_APPROVAL_RISK\s*:\s*(.+)$/m;
const REQUEST_RE = /^\s*HUMAN_APPROVAL_REQUEST\s*:\s*(.+)$/m;

function parseRiskLevel(raw: string | undefined): ApprovalRisk {
  if (!raw) return "medium";
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "low" || trimmed === "medium" || trimmed === "high") {
    return trimmed;
  }
  return "medium";
}

export function detectApprovalRequest(text: string): ApprovalGateSignal {
  if (!text) {
    return { required: false, reason: null, riskLevel: "medium", requestedAction: null };
  }
  const required = REQUIRED_RE.test(text);
  if (!required) {
    return { required: false, reason: null, riskLevel: "medium", requestedAction: null };
  }
  const reason = text.match(REASON_RE);
  const risk = text.match(RISK_RE);
  const request = text.match(REQUEST_RE);
  return {
    required: true,
    reason: reason ? reason[1]!.trim() : null,
    riskLevel: parseRiskLevel(risk ? risk[1] : undefined),
    requestedAction: request ? request[1]!.trim() : null,
  };
}
