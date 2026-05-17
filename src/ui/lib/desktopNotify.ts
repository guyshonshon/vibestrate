// Tiny wrapper around the Web Notifications API. Permission must be
// granted via a user gesture (button click), so call `requestPermission`
// from an onClick handler — never from a useEffect, the browser will
// silently refuse.
//
// We never include secrets or run output in the notification body; only
// the kind + run/task id + a short label. Anything richer belongs in
// the in-page surface where the user can review it.

export type PushKind =
  | "approval-requested"
  | "notification-critical"
  | "run-failed"
  | "suggestion-created";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

const RECENT_LIMIT = 200;
const recentlySeen = new Map<string, number>();

/** De-dupe key — the same approval id should never fire twice. */
function alreadyFired(key: string): boolean {
  const now = Date.now();
  if (recentlySeen.has(key)) return true;
  recentlySeen.set(key, now);
  if (recentlySeen.size > RECENT_LIMIT) {
    // Drop oldest ~half so the map can't grow unbounded.
    const cutoff = now - 30 * 60 * 1000;
    for (const [k, t] of recentlySeen) {
      if (t < cutoff) recentlySeen.delete(k);
    }
  }
  return false;
}

export function push(input: {
  kind: PushKind;
  /** Stable id used to de-dupe (eg. approval id, run id). */
  id: string;
  title: string;
  body: string;
  /** Called when the user clicks the notification. */
  onClick?: () => void;
}): void {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  const key = `${input.kind}:${input.id}`;
  if (alreadyFired(key)) return;
  try {
    const n = new Notification(input.title, {
      body: input.body,
      tag: key, // Browser auto-collapses repeated tags
      silent: false,
    });
    if (input.onClick) {
      n.onclick = () => {
        try {
          window.focus();
          input.onClick?.();
        } finally {
          n.close();
        }
      };
    }
  } catch {
    /* notification permission may have been revoked mid-session */
  }
}
