import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SchedulerLiveness } from "../../lib/schedulerLiveness.js";

type Props = {
  workspace: string;
  liveness: SchedulerLiveness;
  /** Best-known provider label (e.g. "claude / Claude Code"). null when none. */
  activeProvider: string | null;
  unresolvedIssues: number;
  pendingApprovals: number;
  lastRefreshedAt: Date;
};

/**
 * Compact status strip at the very top of Home. Surfaces the four
 * things the user wants visible without opening any panel:
 *
 *   workspace · scheduler liveness · default provider · pending counts
 *
 * Status is encoded by icon + text label *and* color, never color alone.
 */
export function MissionBar({
  workspace,
  liveness,
  activeProvider,
  unresolvedIssues,
  pendingApprovals,
  lastRefreshedAt,
}: Props) {
  const livenessTone =
    liveness.status === "live"
      ? "text-amaco-success"
      : liveness.status === "stale"
        ? "text-amaco-warn"
        : liveness.status === "paused"
          ? "text-amaco-fg-dim"
          : "text-amaco-fail";

  // Show the full liveness summary on its own line whenever the
  // scheduler isn't picking up work — truncating it inside the top
  // strip used to cut off the "· start it with `amaco queue run`"
  // half of the sentence, which is the actionable part.
  const showOfflineRow = !liveness.pickingUpWork;

  return (
    <div className="border-b border-amaco-border bg-amaco-canvas">
      <div
        role="status"
        aria-label="Workspace status"
        className="grid gap-px bg-amaco-border-soft px-6 py-2 text-[11.5px] md:grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1.1fr)_8rem_8rem_7rem]"
      >
        <TelemetryCell
          label="workspace"
          value={workspace}
          className="min-w-0"
        />
        <TelemetryCell
          label="scheduler"
          value={liveness.status}
          tone={livenessTone}
          icon={
            <Activity
              className={`h-3.5 w-3.5 ${liveness.status === "live" ? "animate-pulse" : ""}`}
              strokeWidth={1.8}
              aria-hidden
            />
          }
        />
        <TelemetryCell
          label="default CLI"
          value={activeProvider ?? "none configured"}
          icon={<Cpu className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />}
          className="min-w-0"
        />
        <TelemetryCell
          label="approvals"
          value={String(pendingApprovals)}
          tone={pendingApprovals > 0 ? "text-amaco-fail" : "text-amaco-fg-dim"}
          icon={
            pendingApprovals > 0 ? (
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            )
          }
        />
        <TelemetryCell
          label="issues"
          value={String(unresolvedIssues)}
          tone={unresolvedIssues > 0 ? "text-amaco-fail" : "text-amaco-fg-dim"}
          icon={
            unresolvedIssues > 0 ? (
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            )
          }
        />
        <TelemetryCell
          label="refreshed"
          value={lastRefreshedAt.toLocaleTimeString()}
          icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />}
        />
      </div>
      {showOfflineRow ? (
        <div
          role="alert"
          className={`border-t border-amaco-border-soft px-6 py-1.5 text-[11.5px] ${livenessTone}`}
        >
          {liveness.summary}
        </div>
      ) : null}
    </div>
  );
}

function TelemetryCell({
  label,
  value,
  icon,
  tone = "text-amaco-fg-dim",
  className = "",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 bg-amaco-panel px-2.5 py-1.5 ${className}`}>
      <div className="amaco-mono text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        {label}
      </div>
      <div className={`mt-0.5 flex min-w-0 items-center gap-1.5 ${tone}`}>
        {icon}
        <span className="amaco-mono truncate" title={value}>
          {value}
        </span>
      </div>
    </div>
  );
}
