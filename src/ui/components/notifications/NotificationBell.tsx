import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../../lib/api.js";
import type { NotificationRecord } from "../../lib/types.js";
import { NotificationsSidebar } from "./NotificationsSidebar.js";

type Props = {
  onOpenNotification: (n: NotificationRecord) => void;
  onOpenSettings: () => void;
};

const POLL_INTERVAL_MS = 4000;

function browserPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  if (typeof window.Notification === "undefined") return "unsupported";
  return window.Notification.permission;
}

function shouldNotifyInBrowser(n: NotificationRecord): boolean {
  return n.severity === "attention" || n.severity === "critical";
}

/**
 * Top-bar bell + the slide-in NotificationsSidebar. The bell shows the
 * live unread count (polled + reactive to the sidebar's optimistic
 * mark-as-read), opens the drawer on click, and also listens for the
 * global `amaco:open-notifications` event so other surfaces (e.g. the
 * `g n` chord) can pop the drawer too.
 */
export function NotificationBell({
  onOpenNotification,
  onOpenSettings,
}: Props) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  async function refresh() {
    try {
      const r = await api.listNotifications();
      setUnread(r.unread);

      const perm = browserPermission();
      const browserAllowed = perm === "granted";

      if (!initializedRef.current) {
        for (const n of r.notifications) seenIdsRef.current.add(n.id);
        initializedRef.current = true;
        return;
      }

      if (browserAllowed) {
        for (const n of r.notifications) {
          if (seenIdsRef.current.has(n.id)) continue;
          seenIdsRef.current.add(n.id);
          if (!shouldNotifyInBrowser(n)) continue;
          if (n.readAt !== null) continue;
          try {
            new window.Notification(n.title, {
              body: n.message,
              tag: `amaco:${n.id}`,
            });
          } catch {
            // ignore — browser may rate-limit
          }
        }
      } else {
        for (const n of r.notifications) seenIdsRef.current.add(n.id);
      }
    } catch {
      // ignore — server may be busy
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    const onGlobalOpen = () => setOpen(true);
    window.addEventListener("amaco:open-notifications", onGlobalOpen);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("amaco:open-notifications", onGlobalOpen);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-8 h-8 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-fog-300 hover:text-fog-100"
        title="Notifications"
        aria-label={`Notifications (${unread} unread)`}
      >
        <Bell className="h-4 w-4" strokeWidth={1.6} />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full bg-violet-soft px-1 text-[9.5px] font-semibold leading-none text-ink-0 mono">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <NotificationsSidebar
        open={open}
        onClose={() => {
          setOpen(false);
          // Sync the badge after a possible mark-all-read inside the drawer.
          void refresh();
        }}
        onOpenNotification={(n) => {
          setOpen(false);
          onOpenNotification(n);
        }}
        onOpenSettings={onOpenSettings}
      />
    </>
  );
}
