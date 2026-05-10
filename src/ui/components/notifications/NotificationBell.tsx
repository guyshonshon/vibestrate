import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../../lib/api.js";
import type { NotificationRecord } from "../../lib/types.js";
import { NotificationCenter } from "./NotificationCenter.js";

type Props = {
  onOpenNotification: (n: NotificationRecord) => void;
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

export function NotificationBell({ onOpenNotification }: Props) {
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
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center rounded p-1.5 text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg"
        title="Notifications"
        aria-label={`Notifications (${unread} unread)`}
      >
        <Bell className="h-4 w-4" strokeWidth={1.5} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-amaco-accent px-1 text-[9px] font-medium leading-[14px] text-amaco-canvas">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <NotificationCenter
        open={open}
        onClose={() => setOpen(false)}
        onOpenNotification={(n) => {
          setOpen(false);
          onOpenNotification(n);
        }}
        onChange={setUnread}
      />
    </>
  );
}
