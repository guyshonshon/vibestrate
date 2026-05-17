import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
} from "lucide-react";
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

  return (
    <div
      role="status"
      aria-label="Workspace status"
      className="flex items-center gap-4 border-b border-amaco-border bg-amaco-panel px-6 py-2 text-[11.5px]"
    >
      <div className="flex items-center gap-2 text-amaco-fg-muted">
        <span className="amaco-mono text-[10.5px] uppercase tracking-[0.14em]">
          workspace
        </span>
        <span
          className="amaco-mono truncate text-amaco-fg"
          title={workspace}
        >
          {workspace}
        </span>
      </div>

      <Divider />

      <div className={`flex items-center gap-1.5 ${livenessTone}`}>
        <Activity
          className={`h-3.5 w-3.5 ${liveness.status === "live" ? "animate-pulse" : ""}`}
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="amaco-mono uppercase tracking-[0.1em]">
          {liveness.status}
        </span>
        <span
          className="hidden text-amaco-fg-dim md:inline truncate"
          title={liveness.summary}
        >
          · {shorten(liveness.summary, 60)}
        </span>
      </div>

      <Divider />

      <div className="flex items-center gap-1.5 text-amaco-fg-dim">
        <Cpu className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        <span className="amaco-mono">
          {activeProvider ?? "no provider configured"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div
          className={`amaco-mono inline-flex items-center gap-1 ${
            pendingApprovals > 0 ? "text-amaco-fail" : "text-amaco-fg-muted"
          }`}
          title={`${pendingApprovals} approval(s) waiting`}
        >
          {pendingApprovals > 0 ? (
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          ) : (
            <CheckCircle2
              className="h-3.5 w-3.5"
              strokeWidth={1.5}
              aria-hidden
            />
          )}
          <span>approvals {pendingApprovals}</span>
        </div>
        <div
          className={`amaco-mono inline-flex items-center gap-1 ${
            unresolvedIssues > 0 ? "text-amaco-fail" : "text-amaco-fg-muted"
          }`}
          title={`${unresolvedIssues} unresolved issue(s)`}
        >
          {unresolvedIssues > 0 ? (
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          ) : (
            <CheckCircle2
              className="h-3.5 w-3.5"
              strokeWidth={1.5}
              aria-hidden
            />
          )}
          <span>issues {unresolvedIssues}</span>
        </div>
        <div
          className="amaco-mono inline-flex items-center gap-1 text-amaco-fg-muted"
          title={`Last refreshed ${lastRefreshedAt.toLocaleTimeString()}`}
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          <span>{lastRefreshedAt.toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      className="h-3 w-px bg-amaco-border"
    />
  );
}

function shorten(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trim()}…`;
}
