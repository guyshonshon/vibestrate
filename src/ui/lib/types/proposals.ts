import type { Priority } from "./config.js";

// ─── proposals ────────────────────────────────────────────────────────────────

export type ProposalSummary = {
  id: string;
  sourcePath: string;
  createdAt: string;
  modifiedAt: string;
  accepted: boolean;
  acceptedAt: string | null;
  byteSize: number;
};

export type ProposalRoadmapDraft = {
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
};

export type ProposalTaskDraft = {
  title: string;
  description: string;
  roadmapTitle: string | null;
  priority: Priority;
  riskLevel: Priority;
  dependencies: string[];
  requiredSkills: string[];
  touchedFiles: string[];
  validationHints: string[];
  tags: string[];
};

export type ProposalParseSummary = {
  proposalId: string;
  sourcePath: string | null;
  roadmapItems: ProposalRoadmapDraft[];
  tasks: ProposalTaskDraft[];
  dependencyEdges: { from: string; to: string }[];
  warnings: { taskTitle?: string; roadmapTitle?: string; message: string }[];
  errors: { taskTitle?: string; roadmapTitle?: string; message: string }[];
  needsClarification: string | null;
};

export type ProposalDryRunResponse = {
  dryRun: true;
  willCreate: {
    roadmapItems: ProposalRoadmapDraft[];
    tasks: ProposalTaskDraft[];
    dependencyEdges: { from: string; to: string }[];
  };
  warnings: { message: string }[];
  errors: { message: string }[];
  cycle: string[];
  alreadyAccepted: boolean;
};

export type ProposalAcceptResponse = {
  dryRun: false;
  result: {
    proposalId: string;
    createdRoadmapItemIds: string[];
    createdTaskIds: string[];
    dependencyCount: number;
    warnings: { message: string }[];
    acceptedAt: string;
    auditFilePath: string;
  };
};
