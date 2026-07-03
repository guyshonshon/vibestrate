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
    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-400"
    : freshness.reconnecting
      ? "border-amber-soft/30 bg-amber-soft/10 text-amber-soft"
      : "border-[color:var(--line)] bg-coal-600 text-chalk-400";
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
      className={`num-tabular inline-flex items-center gap-1 rounded-[10px] border px-2 py-1 text-[11px] font-semibold ${tone}`}
      title={
        freshness.lastUpdatedAt
          ? `Last update: ${new Date(freshness.lastUpdatedAt).toLocaleTimeString()}`
          : "No updates yet"
      }
    >
      <Icon className="h-3 w-3" strokeWidth={1.9} aria-hidden />
      {label}
      {ago ? <span className="font-medium text-chalk-400">/ {ago}</span> : null}
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="ml-0.5 rounded-[6px] p-0.5 text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100"
          title="Refresh now"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={1.9} />
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
