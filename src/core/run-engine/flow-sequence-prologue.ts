// Everything the linear flow walk needs in place before its first step runs:
// the two per-run ledgers (participants, arbitration), the checklist plan the
// per-item band iterates, and the task brief every step's prompt reads.
//
// Each function is pure wiring around stores that already exist; none of them
// decide anything about the walk itself. They are split out of the walk so the
// runner reads as "set up, walk, decide" rather than 200 lines of preamble.
//
// The two `state` values returned here are the caller's state advanced by the
// writes these functions perform. The caller must adopt them - dropping one
// silently reverts a persisted `flowParticipants` / `checklistItemIds` patch.

import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { renderTaskGrounding } from "../../roadmap/task-grounding.js";
import type { Provenance } from "../../roadmap/roadmap-types.js";
import { providerCapabilities } from "../../providers/provider-capabilities.js";
import {
  FlowParticipantLedgerStore,
  createFlowParticipantLedger,
  type FlowParticipantLedger,
} from "../../flows/runtime/flow-participant-ledger.js";
import {
  FlowArbitrationStore,
  createFlowArbitrationLedger,
  type FlowArbitrationLedger,
} from "../../flows/runtime/flow-arbitration.js";
import type { ResolvedFlowSnapshot } from "../../flows/schemas/flow-schema.js";
import type { FlowContextOutput } from "../../flows/runtime/flow-context-builder.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import type { ArtifactStore } from "../stores/artifact-store.js";
import type { EventLog } from "../stores/event-log.js";
import {
  runStateSchema,
  type RunState,
  type RunStateStore,
} from "../state-machine.js";
import { patchFlowParticipants } from "./flow-run-state.js";
import { redactSecretsInText } from "../diff-service.js";
import type { ChecklistItemOutcome } from "../run/item-summary.js";
import {
  reconstructDoneOutcomes,
  checklistIdsChanged,
} from "../run/resume-checklist.js";
import { readJson } from "../../utils/json.js";
import { runStatePath } from "../../utils/paths.js";
import type { ResumeFromInput } from "./types.js";
import path from "node:path";

/** One checklist entry as the per-item band consumes it. Carries the saga step
 *  fields (objective / acceptanceCheck / fileHints) alongside id/text so the
 *  saga curated packet can ground each step in them, and `provenance` so the
 *  ENHANCE pass can classify authority (a conductor may not remove an `owner`
 *  step) without a second task read. Non-saga reads only ever touch id/text. */
export type ChecklistBandItem = {
  id: string;
  text: string;
  objective: string;
  acceptanceCheck: string;
  fileHints: string[];
  provenance: Provenance;
};

export type FlowLedgers = {
  participantStore: FlowParticipantLedgerStore;
  participantLedger: FlowParticipantLedger;
  arbitrationStore: FlowArbitrationStore;
  arbitrationLedger: FlowArbitrationLedger;
  /** Caller's state with the participant ledger patched onto it. */
  state: RunState;
};

/**
 * Open (or re-open, on a resume) this run's participant and arbitration
 * ledgers, persist them, and announce each participant's provider capabilities.
 * Both ledgers are read-then-create so a resumed run keeps the sessions and
 * decisions the source run recorded.
 */
export async function openFlowLedgers(input: {
  projectRoot: string;
  providers: ProjectConfig["providers"];
  runId: string;
  snapshot: ResolvedFlowSnapshot;
  state: RunState;
  stateStore: RunStateStore;
  eventLog: EventLog;
}): Promise<FlowLedgers> {
  const participantStore = new FlowParticipantLedgerStore(
    input.projectRoot,
    input.runId,
  );
  const participantLedger =
    (await participantStore.read()) ??
    createFlowParticipantLedger({
      snapshot: input.snapshot,
      capabilities: (providerId) =>
        providerCapabilities(input.providers, providerId),
    });
  await participantStore.write(participantLedger);
  const state = patchFlowParticipants(input.state, participantLedger);
  await input.stateStore.write(state);
  for (const participant of participantLedger.participants) {
    await input.eventLog.append({
      type: "flow.participant.capabilities",
      message: `Flow participant ${participant.seat} uses ${participant.providerId} with ${participant.capabilities.sessionReuse} session reuse.`,
      data: {
        flowId: input.snapshot.flowId,
        seat: participant.seat,
        providerId: participant.providerId,
        capabilities: participant.capabilities,
      },
    });
  }

  const arbitrationStore = new FlowArbitrationStore(
    input.projectRoot,
    input.runId,
  );
  const arbitrationLedger =
    (await arbitrationStore.read()) ??
    createFlowArbitrationLedger({
      runId: input.runId,
      snapshot: input.snapshot,
    });
  await arbitrationStore.write(arbitrationLedger);

  return {
    participantStore,
    participantLedger,
    arbitrationStore,
    arbitrationLedger,
    state,
  };
}

export type ChecklistPlan = {
  /** Empty unless the run is bound to a task whose checklist the flow iterates. */
  items: ChecklistBandItem[];
  /** Redacted, bounded rendering of the bound card, or "" when none is bound. */
  cardGrounding: string;
  /** Outcomes of items the source run already committed, on a resume. */
  resumeSeedOutcomes: ChecklistItemOutcome[];
  /** Caller's state, carrying `checklistItemIds` when the band will iterate. */
  state: RunState;
};

/**
 * Resolve what the per-item band will iterate, and the card context every step
 * is grounded in.
 *
 * Card grounding is unconditional whenever a card is bound - otherwise the
 * planner sees only the task string and guesses. Item ITERATION is narrower: it
 * additionally needs a flow that declares a `checklistSegment` and a requested
 * checklist mode. Without those the segment runs once, the N=1 instant-task
 * case.
 *
 * Throws when resuming a run whose checklist has since been edited: resume
 * skips items by their per-item done status, so a mutated list could skip
 * un-built work or re-run the wrong item.
 */
export async function resolveChecklistPlan(input: {
  roadmap: RoadmapService;
  projectRoot: string;
  taskId: string | null;
  checklistMode: "continuous" | "step" | null;
  sagaMode: boolean;
  resumeFrom: ResumeFromInput | null;
  snapshot: ResolvedFlowSnapshot;
  state: RunState;
  stateStore: RunStateStore;
}): Promise<ChecklistPlan> {
  let items: ChecklistBandItem[] = [];
  let cardGrounding = "";
  let resumeSeedOutcomes: ChecklistItemOutcome[] = [];
  let state = input.state;

  if (!input.taskId) return { items, cardGrounding, resumeSeedOutcomes, state };
  const task = await input.roadmap.getTask(input.taskId);
  if (!task) return { items, cardGrounding, resumeSeedOutcomes, state };

  cardGrounding = redactSecretsInText(renderTaskGrounding(task)).redacted;
  if (!input.snapshot.checklistSegment || !input.checklistMode) {
    return { items, cardGrounding, resumeSeedOutcomes, state };
  }

  items = task.checklist
    .filter((c) => c.status !== "done")
    .map((c) => ({
      id: c.id,
      text: c.text,
      objective: c.objective,
      acceptanceCheck: c.acceptanceCheck,
      fileHints: c.fileHints,
      provenance: c.provenance,
    }));

  // A prior ENHANCE pass may have left a saga-scoped pending overlay: refined
  // text/objective, resequenced, with removed steps absent. It supersedes the
  // original pending steps. The overlay carries only EXISTING ids (autonomous
  // add is excluded), so `task.checklist` - and thus the resume guard below,
  // which compares its ids - is untouched. Any overlay step that has since
  // completed is filtered out by status.
  //
  // FAIL-CLOSED: only apply the overlay if every id it lists still exists in
  // the checklist. A structural checklist edit clears the overlay at the source
  // (RoadmapService.writeChecklist), but if a stale/foreign overlay ever slips
  // through, run the real checklist rather than silently dropping owner steps
  // it doesn't know about.
  const overlay = task.supervised.pendingRevision;
  const checklistIdSet = new Set(task.checklist.map((c) => c.id));
  if (
    input.sagaMode &&
    overlay &&
    overlay.pending.every((p) => checklistIdSet.has(p.id))
  ) {
    const doneIds = new Set(
      task.checklist.filter((c) => c.status === "done").map((c) => c.id),
    );
    items = overlay.pending
      .filter((p) => !doneIds.has(p.id))
      .map((p) => ({
        id: p.id,
        text: p.text,
        objective: p.objective,
        acceptanceCheck: p.acceptanceCheck,
        fileHints: p.fileHints,
        provenance: p.provenance,
      }));
  }

  const currentIds = task.checklist.map((c) => c.id);
  if (input.resumeFrom) {
    const sourceRaw = await readJson<unknown>(
      runStatePath(input.projectRoot, input.resumeFrom.sourceRunId),
    ).catch(() => null);
    const sourceParsed = sourceRaw ? runStateSchema.safeParse(sourceRaw) : null;
    const recordedIds = sourceParsed?.success
      ? sourceParsed.data.checklistItemIds
      : null;
    if (checklistIdsChanged(recordedIds, currentIds)) {
      throw new Error(
        "This task's checklist changed since the run being resumed (items added, removed, or reordered). Re-run the task instead of resuming - resume-from-item relies on a stable checklist.",
      );
    }
    resumeSeedOutcomes = reconstructDoneOutcomes(task.checklist);
  }
  // Record the ordered ids so a later resume of THIS run can verify the
  // checklist hasn't shifted under it (fails open when absent).
  state = { ...state, checklistItemIds: currentIds };
  await input.stateStore.write(state);

  return { items, cardGrounding, resumeSeedOutcomes, state };
}

/**
 * Write the flow's task brief artifact and register it as the `task-brief`
 * output token, so every step's prompt can read the task, the flow brief, the
 * bound card and the checklist it is working through.
 */
export async function writeTaskBrief(input: {
  task: string;
  snapshot: ResolvedFlowSnapshot;
  cardGrounding: string;
  checklistItems: ChecklistBandItem[];
  artifactStore: ArtifactStore;
  outputs: Map<string, FlowContextOutput>;
}): Promise<void> {
  const body = [
    "# Flow Task Brief",
    "",
    `Task: ${input.task}`,
    "",
    input.snapshot.brief ? input.snapshot.brief : "_No extra Flow brief._",
    input.cardGrounding ? `\n${input.cardGrounding}` : "",
    input.checklistItems.length
      ? "\n## Checklist (work these in order, one per item band)\n" +
        input.checklistItems.map((c, i) => `${i + 1}. ${c.text}`).join("\n")
      : "",
  ].join("\n");
  const abs = await input.artifactStore.write(
    path.posix.join("flows", "task-brief.md"),
    `${body}\n`,
  );
  input.outputs.set("task-brief", {
    token: "task-brief",
    label: "Task Brief",
    content: `${body}\n`,
    artifactPath: input.artifactStore.relPath(abs),
  });
}
