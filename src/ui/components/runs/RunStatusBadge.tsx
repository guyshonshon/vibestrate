import type { RunStatus } from "../../lib/types.js";

type Props = {
  status: RunStatus;
  compact?: boolean;
};

const STATUS_COLORS: Record<RunStatus, { dot: string; text: string }> = {
  created: { dot: "bg-vibestrate-fg-muted", text: "text-vibestrate-fg-dim" },
  planning: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  planned: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  architecting: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  architected: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  executing: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  validating: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  reviewing: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  fixing: { dot: "bg-vibestrate-warn", text: "text-vibestrate-warn" },
  verifying: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  // Awaiting human approval is *attention-needed*, not failure.
  // Cyan accent matches in-flight stages so it never reads as "broken".
  waiting_for_approval: { dot: "bg-vibestrate-accent", text: "text-vibestrate-accent" },
  // Paused is "intentional halt" — not an error, not in-flight. Use a
  // dim warn tint so it reads as "the user did this" rather than "broken."
  paused: { dot: "bg-vibestrate-warn", text: "text-vibestrate-warn" },
  merge_ready: { dot: "bg-vibestrate-success", text: "text-vibestrate-success" },
  blocked: { dot: "bg-vibestrate-warn", text: "text-vibestrate-warn" },
  failed: { dot: "bg-vibestrate-fail", text: "text-vibestrate-fail" },
  aborted: { dot: "bg-vibestrate-fg-muted", text: "text-vibestrate-fg-dim" },
};

const STATUS_LABEL: Record<RunStatus, string> = {
  created: "created",
  planning: "planning",
  planned: "planned",
  architecting: "architecting",
  architected: "architected",
  executing: "executing",
  validating: "validating",
  reviewing: "reviewing",
  fixing: "fixing",
  verifying: "verifying",
  waiting_for_approval: "awaiting approval",
  paused: "paused",
  merge_ready: "merge ready",
  blocked: "blocked",
  failed: "failed",
  aborted: "aborted",
};

export function RunStatusBadge({ status, compact }: Props) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${
        compact ? "" : "rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-0.5"
      } vibestrate-mono text-[11px] ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {!compact ? STATUS_LABEL[status] : null}
    </span>
  );
}
