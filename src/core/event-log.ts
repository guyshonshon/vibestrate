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
  | "run.completed"
  | "run.failed"
  | "run.aborted";

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
