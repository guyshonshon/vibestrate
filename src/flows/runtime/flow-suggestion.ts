import { runStateSchema } from "../../core/state-machine.js";
import { readDirSafe } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { projectRunsDir, runStatePath } from "../../utils/paths.js";
import type { RunStatus } from "../../workflow/workflow-types.js";
import { discoverFlows } from "../catalog/flow-discovery.js";

export type FlowSuggestionRisk = "low" | "medium" | "high";

export type FlowSuggestionOutcome = {
  flowId: string;
  status: RunStatus;
  startedAt: string;
};

export type FlowSuggestion = {
  flowId: string;
  label: string;
  confidence: number;
  reasons: string[];
};

export type SuggestFlowsInput = {
  task: string;
  files?: string[];
  riskLevel?: FlowSuggestionRisk | null;
  availableFlows: { id: string; label: string }[];
  pastOutcomes?: FlowSuggestionOutcome[];
};

export type SuggestFlowsForProjectInput = {
  projectRoot: string;
  task: string;
  files?: string[];
  riskLevel?: FlowSuggestionRisk | null;
};

const QUALITY_ARBITRATION_ID = "quality-arbitration";
const COMPLEX_TASK_KEYWORDS = [
  "architecture",
  "architect",
  "feature",
  "implement",
  "migration",
  "migrate",
  "orchestrator",
  "permissions",
  "policy",
  "refactor",
  "rewrite",
  "sandbox",
  "security",
];
const REVIEW_TASK_KEYWORDS = [
  "challenge",
  "cto",
  "quality",
  "review",
  "risky",
  "verify",
];

export function suggestFlows(input: SuggestFlowsInput): FlowSuggestion[] {
  const qualityFlow = input.availableFlows.find(
    (flow) => flow.id === QUALITY_ARBITRATION_ID,
  );
  if (!qualityFlow) return [];

  const task = input.task.trim();
  if (!task) return [];

  let score = 0;
  const reasons: string[] = [];
  const taskHits = keywordHits(task, COMPLEX_TASK_KEYWORDS);
  if (taskHits.length > 0) {
    score += Math.min(taskHits.length, 3);
    reasons.push(
      `Task shape calls for deeper judgment: ${taskHits.slice(0, 4).join(", ")}.`,
    );
  }

  const reviewHits = keywordHits(task, REVIEW_TASK_KEYWORDS);
  if (reviewHits.length > 0) {
    score += Math.min(reviewHits.length + 1, 3);
    reasons.push(
      `Task explicitly asks for challenge or verification: ${reviewHits
        .slice(0, 4)
        .join(", ")}.`,
    );
  }

  if (input.riskLevel === "high") {
    score += 3;
    reasons.push("Risk level is high.");
  } else if (input.riskLevel === "medium") {
    score += 1;
    reasons.push("Risk level is medium.");
  } else if (input.riskLevel === "low") {
    score -= 1;
    reasons.push("Risk level is low.");
  }

  const files = input.files ?? [];
  if (files.length >= 5) {
    score += 2;
    reasons.push(`${files.length} touched files widen review scope.`);
  } else if (files.length >= 2) {
    score += 1;
    reasons.push(`${files.length} touched files cross a single-file boundary.`);
  } else if (files.length === 1) {
    score -= 1;
    reasons.push("Only one touched file is known.");
  }
  if (files.some(isRiskSensitiveFile)) {
    score += 2;
    reasons.push("Touched files include config, security, or runtime control surfaces.");
  }
  if (files.length > 0 && files.every(isDocsFile)) {
    score -= 2;
    reasons.push("Known touched files are docs only.");
  }

  const qualityOutcomes = (input.pastOutcomes ?? [])
    .filter((outcome) => outcome.flowId === QUALITY_ARBITRATION_ID)
    .slice(0, 8);
  const completedOutcomes = qualityOutcomes.filter(
    (outcome) =>
      outcome.status === "merge_ready" || outcome.status === "blocked",
  );
  const failedOutcomes = qualityOutcomes.filter(
    (outcome) => outcome.status === "failed" || outcome.status === "aborted",
  );
  if (completedOutcomes.length > 0) {
    score += 1;
    reasons.push(
      `${completedOutcomes.length} recent local Quality Arbitration run${
        completedOutcomes.length === 1 ? "" : "s"
      } reached a decision.`,
    );
  }
  if (failedOutcomes.length > completedOutcomes.length) {
    score -= 1;
    reasons.push("Recent local Quality Arbitration runs failed more often than they decided.");
  }

  if (score < 3) return [];

  return [
    {
      flowId: qualityFlow.id,
      label: qualityFlow.label,
      confidence: Math.min(Math.round((score / 9) * 100) / 100, 1),
      reasons,
    },
  ];
}

export async function suggestFlowsForProject(
  input: SuggestFlowsForProjectInput,
): Promise<FlowSuggestion[]> {
  const [flows, pastOutcomes] = await Promise.all([
    discoverFlows(input.projectRoot),
    readRecentFlowOutcomes(input.projectRoot),
  ]);
  return suggestFlows({
    task: input.task,
    files: input.files,
    riskLevel: input.riskLevel,
    availableFlows: flows.map((flow) => ({
      id: flow.id,
      label: flow.label,
    })),
    pastOutcomes,
  });
}

async function readRecentFlowOutcomes(
  projectRoot: string,
): Promise<FlowSuggestionOutcome[]> {
  const ids = await readDirSafe(projectRunsDir(projectRoot));
  const outcomes: FlowSuggestionOutcome[] = [];
  for (const id of ids) {
    try {
      const raw = await readJson<unknown>(runStatePath(projectRoot, id));
      const parsed = runStateSchema.safeParse(raw);
      const flowId = parsed.success ? parsed.data.flow?.flowId : null;
      if (!parsed.success || !flowId) continue;
      outcomes.push({
        flowId,
        status: parsed.data.status,
        startedAt: parsed.data.startedAt,
      });
    } catch {
      // Suggestions stay best-effort when a stale run directory is malformed.
    }
  }
  return outcomes
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 32);
}

function keywordHits(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => containsWord(lower, keyword));
}

function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(
    haystack,
  );
}

function isDocsFile(file: string): boolean {
  return /\.(md|mdx|rst|txt)$/i.test(file);
}

function isRiskSensitiveFile(file: string): boolean {
  return /(^|\/)(auth|security|permissions|policy|providers|execution|sandbox|orchestrator)(\/|$)|(^|\/)(package\.json|project\.ya?ml|Dockerfile|.*\.config\.[cm]?[jt]s)$/i.test(
    file,
  );
}
