// The per-item checklist band: the side-effecting entry and exit of one
// checklist item, plus the step-by-step gate between items.
//
// The band is the segment of a flow that repeats once per checklist item, in a
// single worktree, carrying compact summaries forward. Both the linear walk and
// the graph frontier drive it, which is why entry and exit live here rather
// than inline at either call site - there is one source of truth for per-item
// commit. CONTROL FLOW stays at the call sites: jump-back, itemIndex and the
// pause are the caller's to sequence.
//
// Shape worth knowing before editing:
//   - `enterItem` fires ONCE per item at the band head, BEFORE the fix loop.
//     The saga effects it performs (session reset, curated packet) are therefore
//     guarded to the item boundary, not the fix iteration - that is what makes
//     each saga step a fresh context.
//   - Roadmap writes swallow their own failures: a card update must never change
//     a run's outcome.
//   - The walk reassigns `state`, `pendingItemReview` and the participant ledger
//     as it runs, so those reach the band through accessors rather than captured
//     values. A snapshot taken at construction time would be stale by item 2.

import path from "node:path";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { getCurrentBranch, stageAndCommitAll, filesInCommit } from "../../git/git.js";
import { creditTrailers } from "../../git/commit-credit.js";
import { getWorktreeDiffText, redactSecretsInText } from "../diff-service.js";
import { buildStepPacket, readFreshFileReads } from "../saga/packet.js";
import {
  renderCurrentItemBrief,
  buildPriorItemsContext,
  renderItemSummaryArtifact,
  compactImplementationSummary,
  type ChecklistItemOutcome,
} from "../run/item-summary.js";
import { patchFlowParticipants } from "./flow-run-state.js";
import type { ChecklistBandItem } from "./flow-sequence-prologue.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import type { ArtifactStore } from "../stores/artifact-store.js";
import type { EventLog } from "../stores/event-log.js";
import type { RunState, RunStateStore } from "../state-machine.js";
import type { ResolvedFlowStep } from "../../flows/schemas/flow-schema.js";
import type { FlowContextOutput } from "../../flows/runtime/flow-context-builder.js";
import type {
  FlowParticipantLedgerStore,
  FlowParticipantLedger,
} from "../../flows/runtime/flow-participant-ledger.js";

/** The band's own review verdict for the current item. A per-item review band
 *  cannot emit a ledger token, so the walk records its resolved verdict here and
 *  `commitItem` stamps it onto the item outcome. null for non-review bands. */
export type PendingItemReview = {
  verdict: "approved" | "changes_requested";
  openFindingCount: number;
  fixIterations: number;
};

/** How many characters of completed-item context ride into the next item. */
const PRIOR_ITEMS_BUDGET = 1400;

/** The run state a band call borrows. Assembled once per run; the live fields
 *  the walk reassigns are reached through the accessors at the bottom rather
 *  than captured, so each call sees current values. */
export type ChecklistBandDeps = {
  projectRoot: string;
  config: ProjectConfig;
  /** The run's task text (the goal), used to ground the saga packet. */
  task: string;
  /** The bound task card. The band only runs when one is bound. */
  taskId: string | null;
  sagaMode: boolean;
  checklistMode: "continuous" | "step" | null;
  runId: string;
  worktreePath: string | null;
  artifactStore: ArtifactStore;
  stateStore: RunStateStore;
  eventLog: EventLog;
  roadmap: RoadmapService;
  participantStore: FlowParticipantLedgerStore;
  onProgress: (message: string) => void;
  /** The resolved flow's steps and the band's tail index, used to pick the
   *  output that summarizes the item. */
  steps: ResolvedFlowStep[];
  segTo: number;
  /** Stable references the walk shares with the band. */
  outputs: Map<string, FlowContextOutput>;
  itemOutcomes: ChecklistItemOutcome[];
  /** Live reads - the walk rebinds these as it runs. */
  items: () => ChecklistBandItem[];
  participantLedger: () => FlowParticipantLedger;
  getState: () => RunState;
  setState: (state: RunState) => void;
  getPendingItemReview: () => PendingItemReview | null;
  setPendingItemReview: (review: PendingItemReview | null) => void;
  setCurrentItemId: (itemId: string | null) => void;
};

export type ChecklistBand = {
  /** Scope the band to item `i`: write its brief, reset saga context, mark the
   *  card in progress. */
  enterItem: (i: number) => Promise<void>;
  /** Commit and summarize item `i`. Returns whether more items remain;
   *  "proceed" also means the full prior-items ledger has been rebuilt for the
   *  holistic postlude. */
  commitItem: (i: number) => Promise<"repeat" | "proceed">;
  /** Between items in step-by-step mode, request a pause so the next item holds
   *  until the human resumes. A no-op in continuous mode. */
  stepModeGate: (nextIndex: number) => Promise<void>;
};

export function createChecklistBand(deps: ChecklistBandDeps): ChecklistBand {
  const enterItem = async (i: number): Promise<void> => {
    // Fresh per-item review state; the band's loop (review bands only) sets it.
    deps.setPendingItemReview(null);
    const items = deps.items();
    const item = items[i]!;
    const briefContent = renderCurrentItemBrief(item, i, items.length);
    const briefAbs = await deps.artifactStore.write(
      path.posix.join("flows", "checklist", `item-${i + 1}-brief.md`),
      briefContent,
    );
    deps.outputs.set("checklist-item", {
      token: "checklist-item",
      label: `Checklist item ${i + 1}/${items.length}`,
      content: briefContent,
      artifactPath: deps.artifactStore.relPath(briefAbs),
    });
    const priorContent = buildPriorItemsContext(
      deps.itemOutcomes,
      PRIOR_ITEMS_BUDGET,
    );
    if (priorContent) {
      const priorAbs = await deps.artifactStore.write(
        path.posix.join("flows", "checklist", `before-item-${i + 1}.md`),
        priorContent,
      );
      deps.outputs.set("prior-items", {
        token: "prior-items",
        label: "Completed checklist items",
        content: priorContent,
        artifactPath: deps.artifactStore.relPath(priorAbs),
      });
    }

    if (deps.sagaMode) {
      // Null every participant's sessionId and persist, so the next provider
      // turn that DOES reuse sessions opens a FRESH one
      // (prepareFlowParticipantTurn opens a new session when sessionId is null).
      // Resetting the whole band is intentional: the micro-plan -> implement ->
      // review-item step starts from a clean context, the anti-rot guarantee
      // sagas exist for. The saga band steps run via the graph frontier's
      // runRole, which is already stateless per turn, so for them this is a
      // guard; it bites for the linear plan/review participants and any future
      // session-reusing band. The context_reset event is the robust per-step
      // signal - it fires once per step at the band head, not per fix iteration.
      const participantLedger = deps.participantLedger();
      let sessionsReset = 0;
      for (const participant of participantLedger.participants) {
        if (participant.sessionId !== null) {
          participant.sessionId = null;
          sessionsReset += 1;
        }
      }
      if (sessionsReset > 0) {
        await deps.participantStore.write(participantLedger);
        deps.setState(patchFlowParticipants(deps.getState(), participantLedger));
      }
      await deps.eventLog.append({
        type: "supervised.step.context_reset",
        message: `Saga step ${i + 1}/${items.length}: fresh context (${sessionsReset} session(s) reset).`,
        data: { itemId: item.id, index: i, sessionsReset },
      });

      // The curated packet SUPERSEDES the plain brief written above as the
      // `checklist-item` token. The brief artifact is still kept for audit.
      let accumulatedDiff = "";
      if (deps.worktreePath) {
        // Diff from the fork point of the branch the worktree forked from, so
        // committed prior steps are captured (git diff HEAD would miss them).
        const baseBranch = await getCurrentBranch(deps.projectRoot).catch(
          () => null,
        );
        accumulatedDiff = await getWorktreeDiffText({
          worktreePath: deps.worktreePath,
          baseBranch,
        }).catch(() => "");
      }
      const fileReads = deps.worktreePath
        ? await readFreshFileReads({
            worktreePath: deps.worktreePath,
            projectRoot: deps.projectRoot,
            fileHints: item.fileHints,
          }).catch(() => [])
        : [];
      // Re-read the invariants ledger FRESH each step: the between-steps
      // supervisor appends to it after the previous step, so a value cached at
      // band head would be stale by step 2.
      const sagaInvariants = deps.taskId
        ? (await deps.roadmap.getTask(deps.taskId).catch(() => null))?.supervised
            .invariants ?? []
        : [];
      const packet = buildStepPacket({
        goal: deps.task,
        priorItemsContext: priorContent,
        accumulatedDiff,
        fileReads,
        invariants: sagaInvariants,
        item: {
          text: item.text,
          objective: item.objective,
          acceptanceCheck: item.acceptanceCheck,
          index: i,
          total: items.length,
          fileHints: item.fileHints,
        },
      });
      const packetAbs = await deps.artifactStore.write(
        path.posix.join("flows", "checklist", `item-${i + 1}-packet.md`),
        packet,
      );
      deps.outputs.set("checklist-item", {
        token: "checklist-item",
        label: `Saga step ${i + 1}/${items.length}`,
        content: packet,
        artifactPath: deps.artifactStore.relPath(packetAbs),
      });
    }

    deps.setCurrentItemId(item.id);
    await deps.roadmap
      .setChecklistItemStatus(deps.taskId!, item.id, "in_progress")
      .catch(() => {});
    deps.setState({
      ...deps.getState(),
      checklistProgress: {
        total: items.length,
        completed: i,
        currentItemId: item.id,
        currentIndex: i,
      },
    });
    await deps.stateStore.write(deps.getState());
    await deps.eventLog.append({
      type: "checklist.item.started",
      message: `Checklist item ${i + 1}/${items.length}: ${item.text}`,
      data: { itemId: item.id, index: i, text: item.text },
    });
    deps.onProgress(`Item ${i + 1}/${items.length}: ${item.text}`);
  };

  const commitItem = async (i: number): Promise<"repeat" | "proceed"> => {
    const items = deps.items();
    const item = items[i]!;
    let commitSha: string | null = null;
    let filesTouched: string[] = [];
    if (deps.worktreePath) {
      const committed = await stageAndCommitAll({
        cwd: deps.worktreePath,
        message: `${item.text}\n\nChecklist item ${i + 1}/${items.length}.`,
        trailers: {
          "Vibestrate-Run": deps.runId,
          "Vibestrate-Checklist-Item": item.id,
          ...creditTrailers(deps.config.commits),
        },
      });
      commitSha = committed?.sha ?? null;
      if (committed && committed.excludedSymlinks.length > 0) {
        // Never silent: the commit refused to carry out-of-tree symlinks
        // (worktree env links a dir-only ignore pattern missed).
        await deps.eventLog.append({
          type: "git.commit.excluded-symlinks",
          message: `Commit excluded out-of-tree symlink(s): ${committed.excludedSymlinks.join(", ")}.`,
          data: { excludedSymlinks: committed.excludedSymlinks },
        });
      }
      if (commitSha) {
        filesTouched = await filesInCommit(deps.worktreePath, commitSha);
      }
    }
    // Summarize the item by the writer's `execution` output when present (with a
    // band DAG the tail `segTo` may be a read-only join/arbiter whose first
    // output is a verdict, not the build) - fall back to segTo's output.
    const implTok = deps.outputs.has("execution")
      ? "execution"
      : deps.steps[deps.segTo]!.outputs[0];
    const implOutput = implTok ? deps.outputs.get(implTok)?.content ?? "" : "";
    const pendingReview = deps.getPendingItemReview();
    const outcome: ChecklistItemOutcome = {
      itemId: item.id,
      index: i,
      total: items.length,
      text: item.text,
      status: "done",
      commitSha,
      filesTouched,
      summary: redactSecretsInText(compactImplementationSummary(implOutput))
        .redacted,
      error: null,
      reviewVerdict: pendingReview?.verdict ?? null,
      openFindingCount: pendingReview?.openFindingCount ?? 0,
      fixIterations: pendingReview?.fixIterations ?? 0,
    };
    deps.itemOutcomes.push(outcome);
    deps.setCurrentItemId(null);
    await deps.artifactStore.write(
      path.posix.join("flows", "checklist", `item-${i + 1}-summary.md`),
      renderItemSummaryArtifact(outcome),
    );
    await deps.roadmap
      .updateChecklistItem(deps.taskId!, item.id, {
        status: "done",
        commitSha,
        // Saga mode stamps the step's run + curated outcome so a saga's
        // checklist records which run executed each step and a one-line result.
        // Reuses the SAME redacted summary already computed for the outcome (no
        // second redaction pass). Non-saga checklist runs leave these untouched.
        ...(deps.sagaMode
          ? { runId: deps.runId, outcomeSummary: outcome.summary }
          : {}),
      })
      .catch(() => {});
    deps.setState({
      ...deps.getState(),
      checklistProgress: {
        total: items.length,
        completed: i + 1,
        currentItemId: null,
        currentIndex: i,
      },
    });
    await deps.stateStore.write(deps.getState());
    await deps.eventLog.append({
      type: "checklist.item.completed",
      message: `Checklist item ${i + 1}/${items.length} done${commitSha ? ` (${commitSha.slice(0, 8)})` : " (no file changes)"}.`,
      data: { itemId: item.id, index: i, commitSha, files: filesTouched },
    });
    if (i < items.length - 1) return "repeat";

    // Last item done -> rebuild prior-items with the FULL ledger so the holistic
    // postlude (review/verify) sees every item.
    const fullPrior = buildPriorItemsContext(
      deps.itemOutcomes,
      PRIOR_ITEMS_BUDGET,
    );
    if (fullPrior) {
      const fullAbs = await deps.artifactStore.write(
        path.posix.join("flows", "checklist", "all-items.md"),
        fullPrior,
      );
      deps.outputs.set("prior-items", {
        token: "prior-items",
        label: "All completed checklist items",
        content: fullPrior,
        artifactPath: deps.artifactStore.relPath(fullAbs),
      });
    }
    return "proceed";
  };

  const stepModeGate = async (nextIndex: number): Promise<void> => {
    if (deps.checklistMode !== "step") return;
    deps.setState({ ...deps.getState(), pauseRequested: true });
    await deps.stateStore.write(deps.getState());
    await deps.eventLog.append({
      type: "checklist.item.gate",
      message: `Step-by-step: paused before item ${nextIndex + 1}/${deps.items().length}.`,
      data: { nextIndex },
    });
  };

  return { enterItem, commitItem, stepModeGate };
}
