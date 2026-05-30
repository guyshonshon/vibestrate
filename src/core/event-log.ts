import { appendLine } from "../utils/fs.js";
import { runEventsPath } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type VibestrateEventType =
  | "run.created"
  | "run.rewound"
  | "state.changed"
  | "git.worktree.created"
  | "role.started"
  | "role.completed"
  | "role.failed"
  | "provider.started"
  | "provider.completed"
  | "provider.failed"
  | "validation.started"
  | "validation.command.completed"
  | "review.decision"
  | "verification.decision"
  | "policy.warning"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "approval.expired"
  | "run.pause_requested"
  | "run.paused"
  | "run.resume_requested"
  | "run.resumed"
  | "skill.assigned"
  | "skill.unassigned"
  | "run.completed"
  | "run.failed"
  | "run.aborted"
  | "spend.warning"
  | "spend.action"
  | "spend.capped"
  | "editor.opened"
  | "editor.open_failed"
  | "suggestion.created"
  | "suggestion.approved"
  | "suggestion.rejected"
  | "suggestion.applied"
  | "suggestion.apply_failed"
  | "suggestion.validation_passed"
  | "suggestion.validation_failed"
  | "suggestion.reverted"
  | "suggestion.revert_failed"
  | "bundle.created"
  | "bundle.updated"
  | "bundle.approved"
  | "bundle.rejected"
  | "bundle.applied"
  | "bundle.apply_failed"
  | "bundle.partially_applied"
  | "bundle.validation_passed"
  | "bundle.validation_failed"
  | "bundle.reverted"
  | "bundle.revert_failed"
  | "suggestion.auto_revert_succeeded"
  | "suggestion.auto_revert_failed"
  | "bundle.auto_revert_succeeded"
  | "bundle.auto_revert_failed"
  | "bundle.smart_apply_started"
  | "bundle.smart_apply_step_passed"
  | "bundle.smart_apply_step_failed"
  | "bundle.smart_apply_step_reverted"
  | "bundle.smart_apply_completed"
  | "bundle.smart_apply_stopped"
  | "suggestion.validation_profile_updated"
  | "bundle.validation_profile_updated"
  | "mcp.attached"
  | "control.applied"
  | "flow.snapshot.written"
  | "flow.participant.capabilities"
  | "flow.session.opened"
  | "flow.session.reused"
  | "flow.session.rehydrated"
  | "flow.session.stateless"
  | "flow.context.built"
  | "flow.findings.updated"
  | "flow.decision.completed"
  | "flow.step.started"
  | "flow.step.completed"
  | "flow.step.failed"
  | "flow.step.skipped"
  | "flow.loop.iteration"
  | "flow.loop.decision"
  | "checklist.run.started"
  | "checklist.item.started"
  | "checklist.item.completed"
  | "checklist.item.blocked"
  | "checklist.item.gate"
  | "needs_testing.flagged"
  | "action.allowed"
  | "action.denied"
  | "action.approval_required";

export type VibestrateEvent = {
  timestamp: string;
  type: VibestrateEventType;
  message: string;
  data?: Record<string, unknown>;
};

export class EventLog {
  constructor(private readonly projectRoot: string, private readonly runId: string) {}

  get filePath(): string {
    return runEventsPath(this.projectRoot, this.runId);
  }

  async append(event: Omit<VibestrateEvent, "timestamp">): Promise<void> {
    const full: VibestrateEvent = { timestamp: nowIso(), ...event };
    await appendLine(this.filePath, JSON.stringify(full));
  }
}
