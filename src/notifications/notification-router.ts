import type {
  Category,
  Notification,
  Severity,
} from "./notification-types.js";

/**
 * Plain notification template. Callers fill in id/timestamps elsewhere; this
 * type captures only the human content + routing metadata.
 */
export type NotificationDraft = {
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  runId?: string | null;
  taskId?: string | null;
  roadmapItemId?: string | null;
  approvalId?: string | null;
  eventId?: string | null;
  sourceEventType?: string | null;
  actionRequired?: boolean;
  actionLabel?: string | null;
  /** Hash route the dashboard navigates to when the user clicks. */
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

// ─── canonical drafters used by orchestrator/approval/scheduler hooks ─────────

export function draftRunCompleted(input: {
  runId: string;
  taskId: string | null;
  status: "merge_ready" | "blocked" | "failed";
  decision?: string | null;
  verification?: string | null;
}): NotificationDraft {
  if (input.status === "merge_ready") {
    return {
      severity: "success",
      category: "run",
      title: "Run reached merge_ready",
      message: `Run ${input.runId} finished cleanly. Inspect the diff before merging.`,
      runId: input.runId,
      taskId: input.taskId,
      sourceEventType: "run.completed.merge_ready",
      actionRequired: false,
      actionLabel: "Open run",
      actionUrl: `#/runs/${input.runId}`,
    };
  }
  if (input.status === "blocked") {
    return {
      severity: "attention",
      category: "run",
      title: "Run blocked",
      message: `Run ${input.runId} was blocked${
        input.decision ? ` (${input.decision})` : ""
      }. Read the review/verification artifacts before continuing.`,
      runId: input.runId,
      taskId: input.taskId,
      sourceEventType: "run.completed.blocked",
      actionRequired: true,
      actionLabel: "Open run",
      actionUrl: `#/runs/${input.runId}`,
    };
  }
  return {
    severity: "critical",
    category: "run",
    title: "Run failed",
    message: `Run ${input.runId} failed.`,
    runId: input.runId,
    taskId: input.taskId,
    sourceEventType: "run.failed",
    actionRequired: true,
    actionLabel: "Open run",
    actionUrl: `#/runs/${input.runId}`,
  };
}

export function draftApprovalRequested(input: {
  runId: string;
  approvalId: string;
  agentId: string;
  stageId: string;
  reason?: string | null;
}): NotificationDraft {
  return {
    severity: "attention",
    category: "approval",
    title: `Approval requested by ${input.agentId}`,
    message:
      input.reason ??
      `${input.agentId} paused the run at "${input.stageId}" and is asking for your decision.`,
    runId: input.runId,
    approvalId: input.approvalId,
    sourceEventType: "approval.requested",
    actionRequired: true,
    actionLabel: "Open run",
    actionUrl: `#/runs/${input.runId}`,
  };
}

export function draftApprovalResolved(input: {
  runId: string;
  approvalId: string;
  decision: "approved" | "rejected";
}): NotificationDraft {
  return {
    severity: input.decision === "approved" ? "success" : "warning",
    category: "approval",
    title:
      input.decision === "approved"
        ? "Approval granted"
        : "Approval rejected — run blocked",
    message: `Approval ${input.approvalId} was ${input.decision}.`,
    runId: input.runId,
    approvalId: input.approvalId,
    sourceEventType: `approval.${input.decision}`,
    actionRequired: false,
    actionLabel: "Open run",
    actionUrl: `#/runs/${input.runId}`,
  };
}

export function draftValidationFailed(input: {
  runId: string;
  taskId: string | null;
  failedCount: number;
}): NotificationDraft {
  return {
    severity: "warning",
    category: "validation",
    title: "Validation failed",
    message: `${input.failedCount} validation command(s) failed in run ${input.runId}.`,
    runId: input.runId,
    taskId: input.taskId,
    sourceEventType: "validation.failed",
    actionRequired: false,
    actionLabel: "Open run",
    actionUrl: `#/runs/${input.runId}`,
  };
}

export function draftSchedulerConflict(input: {
  taskId: string;
  conflictsWith: string[];
  blocked: boolean;
  overlappingFiles: string[];
}): NotificationDraft {
  return {
    severity: input.blocked ? "warning" : "info",
    category: "conflict",
    title: input.blocked
      ? "Task blocked by file conflict"
      : "File conflict warning",
    message: `Task ${input.taskId} ${
      input.blocked ? "is blocked because" : "starts despite"
    } overlapping ${input.overlappingFiles.length} file(s) with ${input.conflictsWith.join(", ")}.`,
    taskId: input.taskId,
    sourceEventType: "scheduler.conflict",
    actionRequired: input.blocked,
    actionLabel: "Open queue",
    actionUrl: `#/queue`,
  };
}

export function draftTaskBlockedByDependency(input: {
  taskId: string;
  blockerIds: string[];
}): NotificationDraft {
  return {
    severity: "info",
    category: "task",
    title: "Task waiting on dependency",
    message: `Task ${input.taskId} is waiting for ${input.blockerIds.join(", ")} to finish.`,
    taskId: input.taskId,
    sourceEventType: "task.blocked.dependency",
    actionRequired: false,
    actionLabel: "Open task",
    actionUrl: `#/tasks/${input.taskId}`,
  };
}

export function draftQueueDrained(input: {
  completedTaskIds: string[];
}): NotificationDraft {
  return {
    severity: "success",
    category: "scheduler",
    title: "Queue drained",
    message: `Scheduler finished ${input.completedTaskIds.length} task(s).`,
    sourceEventType: "scheduler.queue.drained",
    actionRequired: false,
    actionLabel: "Open queue",
    actionUrl: `#/queue`,
  };
}

export function draftSuggestionValidation(input: {
  runId: string;
  suggestionId: string;
  passed: boolean;
  failedCount: number;
}): NotificationDraft {
  return {
    severity: input.passed ? "success" : "warning",
    category: "review",
    title: input.passed
      ? "Suggestion validation passed"
      : "Suggestion validation failed",
    message: input.passed
      ? `Validation passed against the worktree.`
      : `${input.failedCount} command(s) failed in the run worktree.`,
    runId: input.runId,
    sourceEventType: input.passed
      ? "suggestion.validation_passed"
      : "suggestion.validation_failed",
    actionRequired: !input.passed,
    actionLabel: "Open run",
    actionUrl: `#/runs/${input.runId}`,
    metadata: { suggestionId: input.suggestionId },
  };
}

export function draftBundleEvent(input: {
  runId: string;
  bundleId: string;
  kind:
    | "created"
    | "approved"
    | "applied"
    | "validation_passed"
    | "validation_failed"
    | "reverted"
    | "revert_failed"
    | "apply_failed";
  message: string;
}): NotificationDraft {
  const sev =
    input.kind === "validation_failed" ||
    input.kind === "apply_failed" ||
    input.kind === "revert_failed"
      ? "warning"
      : input.kind === "applied" ||
          input.kind === "validation_passed" ||
          input.kind === "reverted"
        ? "success"
        : "info";
  return {
    severity: sev,
    category: "review",
    title: titleForBundle(input.kind),
    message: input.message,
    runId: input.runId,
    sourceEventType: `bundle.${input.kind}`,
    actionRequired:
      input.kind === "validation_failed" ||
      input.kind === "apply_failed" ||
      input.kind === "revert_failed",
    actionLabel: "Open run",
    actionUrl: `#/runs/${input.runId}`,
    metadata: { bundleId: input.bundleId },
  };
}

function titleForBundle(kind: string): string {
  switch (kind) {
    case "created":
      return "Review pass created";
    case "approved":
      return "Review pass approved";
    case "applied":
      return "Review pass applied";
    case "validation_passed":
      return "Review pass validation passed";
    case "validation_failed":
      return "Review pass validation failed";
    case "reverted":
      return "Review pass reverted";
    case "revert_failed":
      return "Review pass revert failed";
    case "apply_failed":
      return "Review pass apply failed";
    default:
      return `Review pass: ${kind}`;
  }
}

export function draftProviderFailed(input: {
  runId: string;
  providerId: string;
  error: string;
}): NotificationDraft {
  return {
    severity: "critical",
    category: "system",
    title: `Provider "${input.providerId}" failed`,
    message: input.error,
    runId: input.runId,
    sourceEventType: "provider.failed",
    actionRequired: true,
    actionLabel: "Open run",
    actionUrl: `#/runs/${input.runId}`,
  };
}

/**
 * Draft → Notification skeleton (id/timestamps are filled by the service).
 */
export function draftToSkeleton(d: NotificationDraft): Omit<
  Notification,
  "id" | "createdAt" | "updatedAt"
> {
  return {
    severity: d.severity,
    category: d.category,
    title: d.title,
    message: d.message,
    runId: d.runId ?? null,
    taskId: d.taskId ?? null,
    roadmapItemId: d.roadmapItemId ?? null,
    approvalId: d.approvalId ?? null,
    eventId: d.eventId ?? null,
    sourceEventType: d.sourceEventType ?? null,
    actionRequired: d.actionRequired ?? false,
    actionLabel: d.actionLabel ?? null,
    actionUrl: d.actionUrl ?? null,
    readAt: null,
    resolvedAt: null,
    metadata: (d.metadata ?? {}) as Record<string, unknown>,
  };
}
