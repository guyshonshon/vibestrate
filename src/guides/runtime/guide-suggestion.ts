import { runStateSchema } from "../../core/state-machine.js";
import { readDirSafe } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { projectRunsDir, runStatePath } from "../../utils/paths.js";
import type { RunStatus } from "../../workflow/workflow-types.js";
import { discoverGuides } from "../catalog/guide-discovery.js";

export type GuideSuggestionRisk = "low" | "medium" | "high";

export type GuideSuggestionOutcome = {
  guideId: string;
  status: RunStatus;
  startedAt: string;
};

export type GuideSuggestion = {
  guideId: string;
  label: string;
  confidence: number;
  reasons: string[];
};

export type SuggestGuidesInput = {
  task: string;
  files?: string[];
  riskLevel?: GuideSuggestionRisk | null;
  availableGuides: { id: string; label: string }[];
  pastOutcomes?: GuideSuggestionOutcome[];
};

export type SuggestGuidesForProjectInput = {
  projectRoot: string;
  task: string;
  files?: string[];
  riskLevel?: GuideSuggestionRisk | null;
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

export function suggestGuides(input: SuggestGuidesInput): GuideSuggestion[] {
  const qualityGuide = input.availableGuides.find(
    (guide) => guide.id === QUALITY_ARBITRATION_ID,
  );
  if (!qualityGuide) return [];

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
    .filter((outcome) => outcome.guideId === QUALITY_ARBITRATION_ID)
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
      guideId: qualityGuide.id,
      label: qualityGuide.label,
      confidence: Math.min(Math.round((score / 9) * 100) / 100, 1),
      reasons,
    },
  ];
}

export async function suggestGuidesForProject(
  input: SuggestGuidesForProjectInput,
): Promise<GuideSuggestion[]> {
  const [guides, pastOutcomes] = await Promise.all([
    discoverGuides(input.projectRoot),
    readRecentGuideOutcomes(input.projectRoot),
  ]);
  return suggestGuides({
    task: input.task,
    files: input.files,
    riskLevel: input.riskLevel,
    availableGuides: guides.map((guide) => ({
      id: guide.id,
      label: guide.label,
    })),
    pastOutcomes,
  });
}

async function readRecentGuideOutcomes(
  projectRoot: string,
): Promise<GuideSuggestionOutcome[]> {
  const ids = await readDirSafe(projectRunsDir(projectRoot));
  const outcomes: GuideSuggestionOutcome[] = [];
  for (const id of ids) {
    try {
      const raw = await readJson<unknown>(runStatePath(projectRoot, id));
      const parsed = runStateSchema.safeParse(raw);
      const guideId = parsed.success ? parsed.data.guide?.guideId : null;
      if (!parsed.success || !guideId) continue;
      outcomes.push({
        guideId,
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
