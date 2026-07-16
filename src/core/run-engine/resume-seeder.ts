import path from "node:path";
import { ArtifactStore } from "../artifact-store.js";
import type { EventLog } from "../event-log.js";
import type { RunState, RunStateStore } from "../state-machine.js";
import {
  capturePhaseSnapshot,
  readPhaseSnapshots,
  pickSnapshotForResume,
  restorePhaseSnapshot,
  checkRestoreTarget,
  type SnapshotStage,
  type DownstreamResumeStage,
} from "../phase-snapshots.js";
import { nowIso } from "../../utils/time.js";
import type {
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../../flows/schemas/flow-schema.js";
import type { FlowContextOutput } from "../../flows/runtime/flow-context-builder.js";
import {
  DOWNSTREAM_RESUME_STAGES,
  type ResumeFromInput,
  type ResumeStage,
  type RoleRunResult,
} from "./types.js";
import { patchFlowStep } from "./flow-run-state.js";

/** Capture a per-phase worktree snapshot after a code-producing step, so a
 *  later run can rewind to review/verify/fix with this code. Best-effort. */
export async function maybeCapturePhaseSnapshot(input: {
  projectRoot: string;
  step: { kind: string; stage: string | null };
  worktreePath: string | null;
  runId: string;
  eventLog: EventLog;
}): Promise<void> {
  if (!input.worktreePath) return;
  const { step } = input;
  let stage: SnapshotStage | null = null;
  if (step.kind === "agent-turn" && step.stage === "executing") stage = "executing";
  else if (step.kind === "response-turn") stage = "fixing";
  if (!stage) return;
  const snap = await capturePhaseSnapshot({
    projectRoot: input.projectRoot,
    runId: input.runId,
    worktree: input.worktreePath,
    stage,
  });
  if (snap) {
    await input.eventLog.append({
      type: "run.snapshot.captured",
      message: `Captured ${stage} worktree snapshot (#${snap.seq}) for rewind.`,
      data: { seq: snap.seq, stage, treeSha: snap.treeSha },
    });
  }
}

/** Resolve the step index to resume at. Upstream stages match the step's
 *  declared `stage`; the downstream `fixing` resume targets the fixer step by
 *  KIND (the fix step is declared stage "executing", not "fixing"). */
export function resolveResumeIndex(
  snapshot: ResolvedFlowSnapshot,
  fromStage: ResumeStage,
): number {
  if (fromStage === "fixing") {
    return snapshot.steps.findIndex((s) => s.kind === "response-turn");
  }
  if (fromStage === "reviewing") {
    return snapshot.steps.findIndex(
      (s) => s.stage === "reviewing" || s.kind === "review-turn",
    );
  }
  if (fromStage === "verifying") {
    return snapshot.steps.findIndex(
      (s) => s.stage === "verifying" || s.kind === "summary-turn",
    );
  }
  return snapshot.steps.findIndex((s) => s.stage === fromStage);
}

/** Seed the outputs of every step before the resume stage from the source
 *  run and mark them skipped. Returns the index to start the walk at, the
 *  updated state, and seeded plan/execution artifacts (for the report). */
export async function seedResumedSteps(input: {
  projectRoot: string;
  /** `config.git.worktreeDir` - the base every restore target must live inside. */
  worktreeDir: string;
  snapshot: ResolvedFlowSnapshot;
  resumeFrom: ResumeFromInput;
  state: RunState;
  worktreePath: string | null;
  outputs: Map<string, FlowContextOutput>;
  targetStore: ArtifactStore;
  stateStore: RunStateStore;
  eventLog: EventLog;
}): Promise<{
  state: RunState;
  resumeStartIndex: number;
  planArtifact: RoleRunResult | null;
  executionArtifact: RoleRunResult | null;
}> {
  const { snapshot, resumeFrom } = input;
  const resumeStartIndex = resolveResumeIndex(snapshot, resumeFrom.fromStage);
  if (resumeStartIndex < 0) {
    throw new Error(
      `Cannot resume from stage "${resumeFrom.fromStage}": flow "${snapshot.flowId}" has no step at that stage.`,
    );
  }

  // Downstream stages (review/fix/verify) operate on existing code - restore
  // the source run's per-phase worktree snapshot into this run's worktree.
  if (DOWNSTREAM_RESUME_STAGES.has(resumeFrom.fromStage) && input.worktreePath) {
    const sourceSnaps = await readPhaseSnapshots(
      input.projectRoot,
      resumeFrom.sourceRunId,
    );
    const pick = pickSnapshotForResume(
      sourceSnaps,
      resumeFrom.fromStage as DownstreamResumeStage,
    );
    if (pick) {
      // Defense in depth: restore is destructive (checkout-index -f +
      // clean -fd), so positively verify the target is a real run worktree
      // (≠ root, inside the configured worktreeDir, an actual git worktree
      // root) before touching it - never the user's checkout or a stray dir.
      const check = await checkRestoreTarget(
        input.worktreePath,
        input.projectRoot,
        input.worktreeDir,
      );
      const ok = check.safe
        ? await restorePhaseSnapshot(input.worktreePath, pick.treeSha, input.projectRoot, input.worktreeDir)
        : false;
      await input.eventLog.append({
        type: "run.rewound.restored",
        message: !check.safe
          ? `Refused to restore: ${check.reason}.`
          : ok
            ? `Restored ${pick.stage} worktree snapshot (#${pick.seq}) from run ${resumeFrom.sourceRunId}.`
            : `Failed to restore worktree snapshot from run ${resumeFrom.sourceRunId}; the resumed stage may see no code.`,
        data: { sourceRunId: resumeFrom.sourceRunId, seq: pick.seq, stage: pick.stage, ok, safe: check.safe },
      });
    } else {
      await input.eventLog.append({
        type: "run.rewound.restored",
        message: `Source run ${resumeFrom.sourceRunId} has no worktree snapshot to restore for stage "${resumeFrom.fromStage}".`,
        data: { sourceRunId: resumeFrom.sourceRunId, ok: false },
      });
    }
  }
  let state = input.state;
  let planArtifact: RoleRunResult | null = null;
  let executionArtifact: RoleRunResult | null = null;
  const sourceStore = new ArtifactStore(
    input.projectRoot,
    resumeFrom.sourceRunId,
  );

  // Downstream resumes (review/fix/verify) seed everything before the resume
  // step - which can include non-agent steps (validation) whose outputs aren't
  // artifact files. A missing output there is fine (the code itself is restored
  // from the worktree snapshot), so tolerate it; upstream resumes keep the
  // strict contract (a missing plan/architecture is a real error).
  const tolerateMissing = DOWNSTREAM_RESUME_STAGES.has(resumeFrom.fromStage);
  for (let i = 0; i < resumeStartIndex; i += 1) {
    const upstream = snapshot.steps[i]!;
    for (const token of upstream.outputs) {
      const seeded = await seedResumedOutput({
        token,
        step: upstream,
        sourceStore,
        targetStore: input.targetStore,
        tolerateMissing,
      });
      if (!seeded) continue; // missing non-essential output - skip
      input.outputs.set(token, seeded);
      if (token === "plan" || token === "plan-handoff")
        planArtifact = seededFlowResult(upstream, seeded, input.projectRoot);
      if (token === "execution" || token === "execution-handoff")
        executionArtifact = seededFlowResult(upstream, seeded, input.projectRoot);
    }
    state = patchFlowStep(
      state,
      upstream.id,
      { status: "skipped", endedAt: nowIso() },
      upstream.id,
    );
    await input.stateStore.write(state);
    await input.eventLog.append({
      type: "flow.step.skipped",
      message: `Flow step ${upstream.id} skipped (resumed from ${resumeFrom.fromStage}).`,
      data: {
        flowId: snapshot.flowId,
        stepId: upstream.id,
        resumedFrom: resumeFrom.fromStage,
      },
    });
  }

  await input.eventLog.append({
    type: "run.rewound",
    message: `Resumed from run ${resumeFrom.sourceRunId} at stage ${resumeFrom.fromStage}; seeded ${resumeStartIndex} upstream step(s).`,
    data: {
      sourceRunId: resumeFrom.sourceRunId,
      fromStage: resumeFrom.fromStage,
      seededSteps: resumeStartIndex,
    },
  });

  return { state, resumeStartIndex, planArtifact, executionArtifact };
}

/** Read a single upstream output from the source run and copy it into this
 *  run's artifacts. `diff` outputs come from the step's diff snapshot; every
 *  other token comes from the step's role output. Throws clearly if missing. */
export async function seedResumedOutput(input: {
  token: string;
  step: ResolvedFlowStep;
  sourceStore: ArtifactStore;
  targetStore: ArtifactStore;
  /** When true, a missing source output returns null instead of throwing. */
  tolerateMissing?: boolean;
}): Promise<FlowContextOutput | null> {
  const isDiff = input.token === "diff";
  const rel = path.posix.join(
    "flows",
    input.step.id,
    isDiff ? "diff-snapshot.json" : "output.md",
  );
  if (!(await input.sourceStore.exists(rel))) {
    if (input.tolerateMissing) return null;
    throw new Error(
      `Cannot resume: source run is missing "${rel}" (output "${input.token}" of step "${input.step.id}").`,
    );
  }
  const content = await input.sourceStore.read(rel);
  const abs = await input.targetStore.write(rel, content);
  return {
    token: input.token,
    label: `${input.step.label}: ${input.token} (seeded)`,
    content,
    artifactPath: input.targetStore.relPath(abs),
  };
}

/** Synthetic RoleRunResult for an output seeded from a prior run during a
 *  resume. Only `.output`/`.outputArtifactPath` are read downstream; the
 *  provider stub records that no agent turn was spent regenerating it. */
export function seededFlowResult(
  step: ResolvedFlowStep,
  output: FlowContextOutput,
  projectRoot: string,
): RoleRunResult {
  const ts = nowIso();
  return {
    roleId: step.resolvedRoleId ?? "(seeded)",
    output: output.content,
    outputArtifactPath: output.artifactPath,
    promptArtifactPath: "",
    providerResult: {
      providerId: "(seeded)",
      command: "(seeded)",
      args: [],
      cwd: projectRoot,
      exitCode: 0,
      stdout: output.content,
      stderr: "",
      durationMs: 0,
      startedAt: ts,
      endedAt: ts,
      session: null,
      normalized: { responseText: output.content, metrics: null },
    },
  };
}
