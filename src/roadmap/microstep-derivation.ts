import path from "node:path";
import { pathExists, readText } from "../utils/fs.js";
import { runEventsPath, runDir } from "../utils/paths.js";
import { MetricsStore } from "../core/metrics-store.js";
import { ApprovalService } from "../core/approval-service.js";
import type { MicroStep, MicroStepStage, MicroStepStatus } from "./roadmap-types.js";

type Event = {
  timestamp: string;
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

const STAGE_ORDER: MicroStepStage[] = [
  "planning",
  "architecting",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
];

async function readEvents(projectRoot: string, runId: string): Promise<Event[]> {
  const file = runEventsPath(projectRoot, runId);
  if (!(await pathExists(file))) return [];
  const text = await readText(file);
  const out: Event[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Event);
    } catch {
      // skip
    }
  }
  return out;
}

/**
 * Derive per-stage micro-steps for a task's runs from existing on-disk
 * artifacts (events, metrics, approvals). Nothing is persisted separately —
 * micro-steps are a presentation view over the same audit data.
 */
export async function deriveMicroStepsForRun(input: {
  projectRoot: string;
  runId: string;
  taskId: string;
}): Promise<MicroStep[]> {
  const { projectRoot, runId, taskId } = input;
  if (!(await pathExists(runDir(projectRoot, runId)))) return [];

  const [events, metrics, approvals] = await Promise.all([
    readEvents(projectRoot, runId),
    new MetricsStore(projectRoot, runId).read(),
    new ApprovalService(projectRoot, runId).readAll(),
  ]);

  const stepByStage = new Map<MicroStepStage, MicroStep>();

  // Initialise every known stage with `pending`. We mark the ones that have
  // observable activity as running/passed/failed below.
  for (const stage of STAGE_ORDER) {
    stepByStage.set(stage, {
      id: `${runId}:${stage}`,
      taskId,
      stage,
      status: "pending",
      roleId: null,
      startedAt: null,
      endedAt: null,
      artifactPaths: [],
      diffSnapshotPath: null,
      validationResultPath: null,
      approvalIds: [],
      notes: [],
    });
  }

  // Walk metrics: each agent metric maps to a stage.
  if (metrics) {
    for (const a of metrics.roles) {
      const stage = a.stageId as MicroStepStage;
      const step = stepByStage.get(stage);
      if (!step) continue;
      step.roleId = a.roleId;
      step.startedAt = a.startedAt;
      step.endedAt = a.endedAt;
      if (a.promptArtifactPath) step.artifactPaths.push(a.promptArtifactPath);
      if (a.outputArtifactPath) step.artifactPaths.push(a.outputArtifactPath);
      // Status: exit code 0 → passed, otherwise failed (best-effort).
      step.status = a.exitCode === 0 ? "passed" : "failed";
    }
  }

  // Walk events for in-flight signals + validation/review/verification context.
  for (const ev of events) {
    const data = (ev.data ?? {}) as Record<string, unknown>;
    const stageData = data.stageId as string | undefined;
    if (ev.type === "role.started" && stageData) {
      const step = stepByStage.get(stageData as MicroStepStage);
      if (step) {
        if (step.status === "pending") step.status = "running";
        if (typeof data.roleId === "string") step.roleId = data.roleId;
        if (!step.startedAt) step.startedAt = ev.timestamp;
      }
    }
    if (ev.type === "role.failed" && stageData) {
      const step = stepByStage.get(stageData as MicroStepStage);
      if (step) step.status = "failed";
    }
    if (ev.type === "validation.command.completed") {
      const step = stepByStage.get("validating");
      if (step) {
        const status = data.status as string | undefined;
        if (status === "failed") step.status = "failed";
        else if (status === "passed" && step.status !== "failed") step.status = "passed";
        step.notes.push(
          `${(data.command as string) ?? "validation"} → ${data.exitCode ?? "?"}`,
        );
      }
    }
    if (ev.type === "approval.requested" && stageData) {
      const step = stepByStage.get(stageData as MicroStepStage);
      if (step) {
        step.status = "blocked";
        const approvalId = data.approvalId as string | undefined;
        if (approvalId) step.approvalIds.push(approvalId);
      }
    }
  }

  // Attach approval ids by stage even if no event was matched (e.g. policy).
  for (const a of approvals) {
    const step = stepByStage.get(a.stageId as MicroStepStage);
    if (!step) continue;
    if (!step.approvalIds.includes(a.id)) step.approvalIds.push(a.id);
    if (a.status === "pending") step.status = "blocked";
  }

  // Validation result file (if any) lives under artifacts/validation-results.json
  const validationStep = stepByStage.get("validating");
  if (validationStep) {
    const candidate = path.posix.join("artifacts", "07-validation-results.json");
    validationStep.validationResultPath = candidate;
  }

  return STAGE_ORDER.map((s) => stepByStage.get(s)!);
}

export async function deriveMicroStepsForTask(input: {
  projectRoot: string;
  taskId: string;
  runIds: readonly string[];
}): Promise<{ runId: string; steps: MicroStep[] }[]> {
  const out: { runId: string; steps: MicroStep[] }[] = [];
  for (const runId of input.runIds) {
    const steps = await deriveMicroStepsForRun({
      projectRoot: input.projectRoot,
      runId,
      taskId: input.taskId,
    });
    out.push({ runId, steps });
  }
  return out;
}
