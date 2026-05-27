import { appendLine } from "../utils/fs.js";
import { runEventsPath } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type AmacoEventType =
  | "run.created"
  | "run.rewound"
  | "state.changed"
  | "git.worktree.created"
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
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
  | "guide.snapshot.written"
  | "guide.participant.capabilities"
  | "guide.session.opened"
  | "guide.session.reused"
  | "guide.session.rehydrated"
  | "guide.session.stateless"
  | "guide.context.built"
  | "guide.findings.updated"
  | "guide.decision.completed"
  | "guide.step.started"
  | "guide.step.completed"
  | "guide.step.failed"
  | "guide.step.skipped";

export type AmacoEvent = {
  timestamp: string;
  type: AmacoEventType;
  message: string;
  data?: Record<string, unknown>;
};

export class EventLog {
  constructor(private readonly projectRoot: string, private readonly runId: string) {}

  get filePath(): string {
    return runEventsPath(this.projectRoot, this.runId);
  }

  async append(event: Omit<AmacoEvent, "timestamp">): Promise<void> {
    const full: AmacoEvent = { timestamp: nowIso(), ...event };
    await appendLine(this.filePath, JSON.stringify(full));
  }
}
