import type { RunStatus } from "../../lib/types.js";

type Props = {
  status: RunStatus;
  compact?: boolean;
};

const STATUS_COLORS: Record<RunStatus, { dot: string; text: string }> = {
  created: { dot: "bg-amaco-fg-muted", text: "text-amaco-fg-dim" },
  planning: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  planned: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  architecting: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  architected: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  executing: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  validating: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  reviewing: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  fixing: { dot: "bg-amaco-warn", text: "text-amaco-warn" },
  verifying: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  // Awaiting human approval is *attention-needed*, not failure.
  // Cyan accent matches in-flight stages so it never reads as "broken".
  waiting_for_approval: { dot: "bg-amaco-accent", text: "text-amaco-accent" },
  // Paused is "intentional halt" — not an error, not in-flight. Use a
  // dim warn tint so it reads as "the user did this" rather than "broken."
  paused: { dot: "bg-amaco-warn", text: "text-amaco-warn" },
  merge_ready: { dot: "bg-amaco-success", text: "text-amaco-success" },
  blocked: { dot: "bg-amaco-warn", text: "text-amaco-warn" },
  failed: { dot: "bg-amaco-fail", text: "text-amaco-fail" },
  aborted: { dot: "bg-amaco-fg-muted", text: "text-amaco-fg-dim" },
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
        compact ? "" : "rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5"
      } amaco-mono text-[11px] ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {!compact ? STATUS_LABEL[status] : null}
    </span>
  );
}
