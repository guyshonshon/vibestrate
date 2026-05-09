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

export const approvalRequestSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stageId: z.string().min(1),
  agentId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: approvalStatusSchema,
  reason: z.string().nullable().default(null),
  prompt: z.string().nullable().default(null),
  sourceArtifactPath: z.string().nullable().default(null),
  requestedAction: z.string().nullable().default(null),
  riskLevel: approvalRiskSchema.default("medium"),
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
};

const REQUIRED_RE = /^\s*HUMAN_APPROVAL\s*:\s*REQUIRED\s*$/m;
const REASON_RE = /^\s*HUMAN_APPROVAL_REASON\s*:\s*(.+)$/m;

export function detectApprovalRequest(text: string): ApprovalGateSignal {
  if (!text) return { required: false, reason: null };
  const required = REQUIRED_RE.test(text);
  if (!required) return { required: false, reason: null };
  const reason = text.match(REASON_RE);
  return { required: true, reason: reason ? reason[1]!.trim() : null };
}
