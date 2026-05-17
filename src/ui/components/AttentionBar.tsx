import { useEffect, useState } from "react";
import {
  notificationsSupported,
  permissionState,
  requestPermission,
} from "../lib/desktopNotify.js";

export type AttentionCounts = {
  approvals: number;
  suggestions: number;
  unreadNotifications: number;
  failedRuns: number;
};

type Props = {
  counts: AttentionCounts;
  /** Scrolls / opens the right-rail inbox. */
  onFocusInbox: () => void;
};

/**
 * Loud-by-default banner that pins itself to the top of Mission Control
 * whenever something is waiting on the user. Hidden when all counters
 * are zero — so it never adds noise to an idle workspace.
 *
 * Also exposes a one-click "Enable desktop alerts" button. The button
 * has to live on a real user gesture because browsers refuse
 * `Notification.requestPermission()` from a `useEffect`.
 */
export function AttentionBar({ counts, onFocusInbox }: Props) {
  const total =
    counts.approvals +
    counts.suggestions +
    counts.unreadNotifications +
    counts.failedRuns;

  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    () => permissionState(),
  );
  useEffect(() => {
    // Browser may revoke between renders.
    const t = window.setInterval(() => setPerm(permissionState()), 5000);
    return () => window.clearInterval(t);
  }, []);

  if (total === 0 && perm !== "default") {
    // Nothing waiting and the user has already answered the prompt.
    return null;
  }

  const parts: string[] = [];
  if (counts.approvals > 0)
    parts.push(
      `${counts.approvals} approval${counts.approvals === 1 ? "" : "s"} waiting`,
    );
  if (counts.failedRuns > 0)
    parts.push(
      `${counts.failedRuns} run${counts.failedRuns === 1 ? "" : "s"} failed`,
    );
  if (counts.suggestions > 0)
    parts.push(
      `${counts.suggestions} suggestion${counts.suggestions === 1 ? "" : "s"} to review`,
    );
  if (counts.unreadNotifications > 0)
    parts.push(
      `${counts.unreadNotifications} unread notification${counts.unreadNotifications === 1 ? "" : "s"}`,
    );

  const tone =
    counts.approvals > 0 || counts.failedRuns > 0
      ? "border-amaco-fail/60 bg-amaco-fail/15 text-amaco-fail"
      : counts.suggestions > 0
        ? "border-amaco-warn/60 bg-amaco-warn/10 text-amaco-warn"
        : "border-amaco-accent/40 bg-amaco-accent/10 text-amaco-accent";

  const pulse = counts.approvals > 0 || counts.failedRuns > 0;

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 border-y px-6 py-2 text-[12.5px] ${tone}`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-full bg-current ${
            pulse ? "animate-pulse" : ""
          }`}
        />
        <span className="font-medium">
          {total > 0
            ? parts.join(" · ")
            : "Stay on top of approvals and failures even when this tab is in the background"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {total > 0 ? (
          <button
            onClick={onFocusInbox}
            className="rounded border border-current px-2 py-0.5 text-[11.5px] font-medium hover:bg-current/10"
          >
            Open inbox →
          </button>
        ) : null}
        {notificationsSupported() && perm === "default" ? (
          <button
            onClick={() => {
              void requestPermission().then((p) => setPerm(p));
            }}
            className="rounded border border-current px-2 py-0.5 text-[11.5px] font-medium hover:bg-current/10"
            title="Browser will ask permission. We never include run output — only a one-line title + id."
          >
            🔔 Enable desktop alerts
          </button>
        ) : null}
        {perm === "denied" ? (
          <span
            className="amaco-mono text-[10.5px] opacity-70"
            title="Re-enable from the site settings in your browser."
          >
            alerts blocked
          </span>
        ) : null}
      </div>
    </div>
  );
}
