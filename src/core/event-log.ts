import { appendLine } from "../utils/fs.js";
import { runEventsPath } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type AmacoEventType =
  | "run.created"
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
  | "run.resumed"
  | "skill.assigned"
  | "skill.unassigned"
  | "run.completed"
  | "run.failed"
  | "run.aborted"
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
  | "bundle.revert_failed";

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
