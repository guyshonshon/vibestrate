import { useEffect, useState } from "react";
import { Bell, BellOff, X, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  NotificationCategory,
  NotificationRecord,
} from "../../lib/types.js";
import { NotificationItem } from "./NotificationItem.js";

type Filter = "all" | "unread" | "attention";

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
  onChange: (unread: number) => void;
};

const ALL_CATEGORIES: NotificationCategory[] = [
  "run",
  "approval",
  "task",
  "scheduler",
  "conflict",
  "validation",
  "review",
  "system",
  "gateway",
];

export function NotificationCenter({
  open,
  onClose,
  onOpenNotification,
  onChange,
}: Props) {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<"" | NotificationCategory>("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const r = await api.listNotifications();
      setItems(r.notifications);
      onChange(r.unread);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleMarkRead(id: string) {
    const updated = await api.markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
    void refresh();
  }
  async function handleResolve(id: string) {
    const updated = await api.resolveNotification(id);
    setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
    void refresh();
  }
  async function handleMarkAll() {
    await api.markAllNotificationsRead();
    void refresh();
  }

  if (!open) return null;

  const filtered = items.filter((n) => {
    if (filter === "unread" && n.readAt !== null) return false;
    if (
      filter === "attention" &&
      n.severity !== "attention" &&
      n.severity !== "critical"
    )
      return false;
    if (category && n.category !== category) return false;
    return true;
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        role="presentation"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-[420px] max-w-[100vw] flex-col border-l border-amaco-border bg-amaco-panel">
        <header className="flex items-center gap-2 border-b border-amaco-border px-3 py-2.5">
          <Bell className="h-4 w-4 text-amaco-accent" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-amaco-fg">
            Notifications
          </span>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[11px] text-amaco-fg-dim hover:bg-amaco-panel-2 disabled:opacity-50"
            title="Mark all as read"
          >
            <BellOff className="h-3 w-3" strokeWidth={1.5} />
            Mark all read
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="rounded border border-amaco-border p-1 text-amaco-fg-dim hover:bg-amaco-panel-2 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-amaco-border p-1 text-amaco-fg-dim hover:bg-amaco-panel-2"
            title="Close"
          >
            <X className="h-3 w-3" strokeWidth={1.5} />
          </button>
        </header>
        <div className="flex flex-wrap gap-1.5 border-b border-amaco-border px-3 py-2">
          {(["all", "unread", "attention"] as Filter[]).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                filter === f
                  ? "border-amaco-accent/50 bg-amaco-accent-soft/30 text-amaco-fg"
                  : "border-amaco-border text-amaco-fg-dim hover:bg-amaco-panel-2"
              }`}
            >
              {f}
            </button>
          ))}
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as "" | NotificationCategory)
            }
            className="ml-auto rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[11px] text-amaco-fg-dim"
          >
            <option value="">all categories</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-amaco-fg-muted">
              No notifications.
            </div>
          ) : (
            filtered.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onMarkRead={handleMarkRead}
                onResolve={handleResolve}
                onOpen={onOpenNotification}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
