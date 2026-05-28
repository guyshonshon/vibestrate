import { useEffect, useState } from "react";
import { Activity, RefreshCw, WifiOff } from "lucide-react";
import type { CodebaseFreshness } from "../../lib/useCodebaseEvents.js";

type Props = {
  freshness: CodebaseFreshness;
  /** Optional manual-refresh hook. */
  onRefresh?: () => void;
};

/**
 * Compact "live · 12 s ago" / "stale · reconnecting" pill used by the project,
 * codebase, git, and run-detail headers. Updates once a second so the relative
 * time stays accurate without re-rendering the whole page.
 */
export function FreshnessIndicator({ freshness, onRefresh }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  const ago = relativeAgo(freshness.lastUpdatedAt);
  const tone = freshness.connected
    ? "border-vibestrate-success/40 text-vibestrate-success"
    : freshness.reconnecting
      ? "border-vibestrate-warn/40 text-vibestrate-warn"
      : "border-vibestrate-border text-vibestrate-fg-muted";
  const Icon = freshness.connected
    ? Activity
    : freshness.reconnecting
      ? WifiOff
      : Activity;
  const label = freshness.connected
    ? "live"
    : freshness.reconnecting
      ? "reconnecting"
      : "idle";

  return (
    <span
      className={`vibestrate-mono inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] ${tone}`}
      title={
        freshness.lastUpdatedAt
          ? `Last update: ${new Date(freshness.lastUpdatedAt).toLocaleTimeString()}`
          : "No updates yet"
      }
    >
      <Icon className="h-3 w-3" strokeWidth={1.5} />
      {label}
      {ago ? <span className="text-vibestrate-fg-muted">· {ago}</span> : null}
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="ml-1 rounded p-0.5 hover:bg-vibestrate-panel-2"
          title="Refresh now"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
        </button>
      ) : null}
    </span>
  );
}

function relativeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return "";
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s ago`;
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / (60 * 60_000))}h ago`;
}
