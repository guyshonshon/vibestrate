// Pure mapper: every UI action that has a CLI equivalent declares it
// here so the right-click "Copy CLI" item and the future help overlays
// stay in sync with reality. If a UI action has *no* CLI equivalent
// the helper returns null — callers should hide the menu entry rather
// than copy a fake command.

export type UiAction =
  | { kind: "open-task"; taskId: string }
  | { kind: "queue-task"; taskId: string }
  | { kind: "cancel-task"; taskId: string }
  | { kind: "run-task"; taskId: string }
  | { kind: "open-run"; runId: string }
  | { kind: "status-run"; runId: string }
  | { kind: "replay-run"; runId: string }
  | { kind: "pause-run"; runId: string }
  | { kind: "resume-run"; runId: string }
  | { kind: "abort-run"; runId: string }
  | { kind: "approve-approval"; runId: string; approvalId: string }
  | { kind: "reject-approval"; runId: string; approvalId: string }
  | { kind: "spawn-run"; task: string; provider?: string; effort?: string; readOnly?: boolean; skills?: string[]; concise?: boolean }
  | { kind: "start-scheduler" };

export function cliFor(a: UiAction): string | null {
  switch (a.kind) {
    case "open-task":
      // No CLI verb opens a task; closest is `tasks show` (planned).
      return null;
    case "queue-task":
      return `vibe queue add ${a.taskId}`;
    case "cancel-task":
      return `vibe tasks cancel ${a.taskId}`;
    case "run-task":
      return `vibe tasks run ${a.taskId}`;
    case "open-run":
      return `vibe status ${a.runId}`;
    case "status-run":
      return `vibe status ${a.runId}`;
    case "replay-run":
      return `vibe replay ${a.runId}`;
    case "pause-run":
      return `vibe pause ${a.runId}`;
    case "resume-run":
      return `vibe resume ${a.runId}`;
    case "abort-run":
      return `vibe abort ${a.runId}`;
    case "approve-approval":
      // Server-only at the moment; CLI parity is on the backlog.
      return null;
    case "reject-approval":
      return null;
    case "start-scheduler":
      return `vibe queue run`;
    case "spawn-run": {
      const parts = ["vibe", "run"];
      if (a.provider) parts.push("--provider", a.provider);
      if (a.effort) parts.push("--effort", a.effort);
      if (a.readOnly) parts.push("--read-only");
      if (a.skills && a.skills.length > 0)
        parts.push("--skills", a.skills.join(","));
      if (a.concise) parts.push("--concise");
      // Wrap the task in quotes if it has whitespace; argv shells
      // would otherwise split it.
      const t = a.task.includes(" ") ? JSON.stringify(a.task) : a.task;
      parts.push(t);
      return parts.join(" ");
    }
  }
}
