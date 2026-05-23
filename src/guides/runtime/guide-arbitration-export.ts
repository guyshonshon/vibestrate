import { MetricsStore } from "../../core/metrics-store.js";
import { RunStateStore } from "../../core/state-machine.js";
import { ReviewSuggestionService } from "../../reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../../reviews/suggestion-bundle-service.js";
import { GuideParticipantLedgerStore } from "./guide-participant-ledger.js";
import {
  GuideArbitrationStore,
  summarizeGuideDisagreements,
} from "./guide-arbitration.js";

export class GuideArbitrationExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideArbitrationExportError";
  }
}

export type GuideArbitrationDataset = Awaited<
  ReturnType<typeof exportGuideArbitrationDataset>
>;

export async function exportGuideArbitrationDataset(input: {
  projectRoot: string;
  runId: string;
}) {
  const state = await new RunStateStore(input.projectRoot, input.runId).read();
  if (!state) {
    throw new GuideArbitrationExportError(`Run ${input.runId} not found.`);
  }
  if (!state.guide) {
    throw new GuideArbitrationExportError(
      `Run ${input.runId} has no Guide state to export.`,
    );
  }
  const ledger = await new GuideArbitrationStore(
    input.projectRoot,
    input.runId,
  ).read();
  if (!ledger) {
    throw new GuideArbitrationExportError(
      `Run ${input.runId} has no arbitration.json record.`,
    );
  }

  const [metrics, participants, suggestions, bundles] = await Promise.all([
    new MetricsStore(input.projectRoot, input.runId).read(),
    new GuideParticipantLedgerStore(input.projectRoot, input.runId).read(),
    new ReviewSuggestionService(input.projectRoot, input.runId)
      .list()
      .catch(() => []),
    new SuggestionBundleService(input.projectRoot, input.runId)
      .list()
      .catch(() => []),
  ]);
  const acceptedSuggestionIds = new Set(
    ledger.findings
      .map((record) => record.suggestionId)
      .filter((id): id is string => id !== null),
  );
  const acceptedReviewPassIds = new Set(
    ledger.acceptedReviewPassId ? [ledger.acceptedReviewPassId] : [],
  );

  return {
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    run: {
      runId: state.runId,
      task: state.task,
      taskId: state.taskId,
      status: state.status,
      finalDecision: state.finalDecision,
      verification: state.verification,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      humanDisposition: null as string | null,
    },
    guide: {
      guideId: state.guide.guideId,
      guideVersion: state.guide.guideVersion,
      snapshotPath: state.guide.snapshotPath,
      steps: state.guide.steps.map((step) => ({
        id: step.id,
        kind: step.kind,
        status: step.status,
        providerId: step.providerId,
        outputArtifactPath: step.outputArtifactPath,
        validationArtifactPath: step.validationArtifactPath,
      })),
    },
    arbitration: ledger,
    disagreementRecords: summarizeGuideDisagreements(ledger),
    participants: participants?.participants ?? [],
    providerTurns:
      metrics?.agents
        .filter((agent) =>
          state.guide?.steps.some((step) => step.id === agent.stageId),
        )
        .map((agent) => ({
          stepId: agent.stageId,
          agentId: agent.agentId,
          providerId: agent.providerId,
          providerType: agent.providerType,
          model: agent.model,
          sessionId: agent.sessionId,
          contextMode: agent.guideContextMode,
          totalCostUsd: agent.totalCostUsd,
          tokenUsage: agent.tokenUsage,
          exitCode: agent.exitCode,
        })) ?? [],
    acceptedSuggestions: suggestions.filter((suggestion) =>
      acceptedSuggestionIds.has(suggestion.id),
    ),
    acceptedReviewPasses: bundles.filter((bundle) =>
      acceptedReviewPassIds.has(bundle.id),
    ),
  };
}
