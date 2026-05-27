import { MetricsStore } from "../../core/metrics-store.js";
import { RunStateStore } from "../../core/state-machine.js";
import { ReviewSuggestionService } from "../../reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../../reviews/suggestion-bundle-service.js";
import { FlowParticipantLedgerStore } from "./flow-participant-ledger.js";
import {
  FlowArbitrationStore,
  summarizeFlowDisagreements,
} from "./flow-arbitration.js";

export class FlowArbitrationExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowArbitrationExportError";
  }
}

export type FlowArbitrationDataset = Awaited<
  ReturnType<typeof exportFlowArbitrationDataset>
>;

export async function exportFlowArbitrationDataset(input: {
  projectRoot: string;
  runId: string;
}) {
  const state = await new RunStateStore(input.projectRoot, input.runId).read();
  if (!state) {
    throw new FlowArbitrationExportError(`Run ${input.runId} not found.`);
  }
  if (!state.flow) {
    throw new FlowArbitrationExportError(
      `Run ${input.runId} has no Flow state to export.`,
    );
  }
  const ledger = await new FlowArbitrationStore(
    input.projectRoot,
    input.runId,
  ).read();
  if (!ledger) {
    throw new FlowArbitrationExportError(
      `Run ${input.runId} has no arbitration.json record.`,
    );
  }

  const [metrics, participants, suggestions, bundles] = await Promise.all([
    new MetricsStore(input.projectRoot, input.runId).read(),
    new FlowParticipantLedgerStore(input.projectRoot, input.runId).read(),
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
    flow: {
      flowId: state.flow.flowId,
      flowVersion: state.flow.flowVersion,
      snapshotPath: state.flow.snapshotPath,
      steps: state.flow.steps.map((step) => ({
        id: step.id,
        kind: step.kind,
        status: step.status,
        providerId: step.providerId,
        outputArtifactPath: step.outputArtifactPath,
        validationArtifactPath: step.validationArtifactPath,
      })),
    },
    arbitration: ledger,
    disagreementRecords: summarizeFlowDisagreements(ledger),
    participants: participants?.participants ?? [],
    providerTurns:
      metrics?.roles
        .filter((agent) =>
          state.flow?.steps.some((step) => step.id === agent.stageId),
        )
        .map((agent) => ({
          stepId: agent.stageId,
          roleId: agent.roleId,
          providerId: agent.providerId,
          providerType: agent.providerType,
          model: agent.model,
          sessionId: agent.sessionId,
          contextMode: agent.flowContextMode,
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
