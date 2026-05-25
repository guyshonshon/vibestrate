import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Bolt,
  Check,
  Cpu,
  Diff,
  Eye,
  Play,
  Scale,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../lib/api.js";
import { streamAllEvents } from "../../lib/aggregateEvents.js";
import type {
  NotificationCategory,
  NotificationRecord,
} from "../../lib/types.js";
import { Chip } from "../design/Chip.js";
import { cn } from "../design/cn.js";

// ── Visual mapping ────────────────────────────────────────────────────────

type Tone = "amber" | "sky" | "emerald" | "rose" | "violet";

type Kind =
  | "approval"
  | "cost"
  | "comment"
  | "merged"
  | "changes"
  | "failed"
  | "agent-status"
  | "system";

/**
 * Project a backend NotificationRecord onto the design's "kind" axis.
 * Pure — no side effects. The backend uses `category` + `severity`;
 * the design groups by audience-facing intent.
 */
function classifyKind(n: NotificationRecord): Kind {
  if (n.category === "approval") return "approval";
  if (n.category === "review") return "comment";
  if (n.category === "validation") return "changes";
  if (n.category === "scheduler" || n.category === "conflict") return "system";
  if (n.category === "gateway") return "system";
  if (n.category === "task") return "system";
  if (n.category === "run") {
    if (n.severity === "critical" || n.severity === "attention") return "failed";
    if (n.severity === "success") return "merged";
    return "changes";
  }
  return "system";
}

const KIND_META: Record<
  Kind,
  { tone: Tone; icon: LucideIcon }
> = {
  approval: { tone: "amber", icon: Scale },
  cost: { tone: "amber", icon: Bolt },
  comment: { tone: "sky", icon: Diff },
  merged: { tone: "emerald", icon: Check },
  changes: { tone: "amber", icon: Diff },
  failed: { tone: "rose", icon: X },
  "agent-status": { tone: "rose", icon: Cpu },
  system: { tone: "violet", icon: Sparkles },
};

const TONE_BG: Record<
  Tone,
  { soft: string; ring: string; text: string }
> = {
  amber: {
    soft: "bg-amber-500/10",
    ring: "ring-amber-400/30",
    text: "text-amber-300",
  },
  sky: {
    soft: "bg-sky-500/10",
    ring: "ring-sky-400/30",
    text: "text-sky-glow",
  },
  emerald: {
    soft: "bg-emerald-500/10",
    ring: "ring-emerald-400/30",
    text: "text-emerald-300",
  },
  rose: {
    soft: "bg-rose-500/10",
    ring: "ring-rose-400/30",
    text: "text-rose-300",
  },
  violet: {
    soft: "bg-violet-soft/10",
    ring: "ring-violet-soft/30",
    text: "text-violet-soft",
  },
};

// ── Compact "just now / 4m / 12h / 2d" relative time ─────────────────────

function relShort(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 30) return "just now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// ── Bucketing ─────────────────────────────────────────────────────────────

type Bucket = "today" | "yesterday" | "earlier";

function bucketOf(iso: string, now = Date.now()): Bucket {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "earlier";
  const today = new Date(now);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  if (t >= startOfToday) return "today";
  if (t >= startOfYesterday) return "yesterday";
  return "earlier";
}

// ── Filter tabs ───────────────────────────────────────────────────────────

type FilterId = "all" | "approval" | "runs" | "system";

const FILTERS: { id: FilterId; label: string; kinds?: Kind[] }[] = [
  { id: "all", label: "All" },
  { id: "approval", label: "Approvals", kinds: ["approval"] },
  {
    id: "runs",
    label: "Runs",
    kinds: ["merged", "changes", "failed", "comment"],
  },
  {
    id: "system",
    label: "System",
    kinds: ["system", "cost", "agent-status"],
  },
];

// ── Event types that warrant an inbox refresh ─────────────────────────────

const REFRESH_EVENT_TYPES = new Set([
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "run.completed",
  "run.failed",
  "run.aborted",
  "run.merge_ready",
  "suggestion.created",
  "validation.failed",
  "notification.created",
]);

// ── Props ─────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
  onOpenSettings: () => void;
};

const POLL_INTERVAL_MS = 15000;

export function NotificationsSidebar({
  open,
  onClose,
  onOpenNotification,
  onOpenSettings,
}: Props) {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [busy, setBusy] = useState<Record<string, true>>({});
  const [busyAll, setBusyAll] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Real data loader ─
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.listNotifications();
        if (!cancelled) {
          setItems(r.notifications);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    // Safety-net poll behind the SSE stream — the stream covers latency
    // but a long-running tab can drop the connection.
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    // Wire the live event stream — push-driven refresh on every event
    // type that could produce a notification on the server.
    const disconnect = streamAllEvents({
      onEvent: ({ event }) => {
        setSseConnected(true);
        if (event.type && REFRESH_EVENT_TYPES.has(event.type)) {
          void load();
        }
      },
    });
    return () => {
      cancelled = true;
      window.clearInterval(id);
      disconnect();
    };
  }, []);

  // ── Body scroll lock + escape close while open ─
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // ── Optimistic mutate helpers ─
  const markReadLocal = (id: string) =>
    setItems((cur) =>
      cur.map((n) =>
        n.id === id && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
  const dismissLocal = (id: string) =>
    setItems((cur) => cur.filter((n) => n.id !== id));
  const setBusyFor = (id: string, on: boolean) =>
    setBusy((cur) => {
      if (on) return { ...cur, [id]: true };
      const next = { ...cur };
      delete next[id];
      return next;
    });

  const handleMarkRead = async (n: NotificationRecord) => {
    if (n.readAt) return;
    markReadLocal(n.id);
    try {
      await api.markNotificationRead(n.id);
    } catch {
      /* refresh poll resyncs */
    }
  };
  const handleDismiss = async (n: NotificationRecord) => {
    dismissLocal(n.id);
    try {
      await api.resolveNotification(n.id);
    } catch {
      /* refresh poll resyncs */
    }
  };
  const handleMarkAll = async () => {
    if (busyAll) return;
    setBusyAll(true);
    const now = new Date().toISOString();
    setItems((cur) => cur.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    try {
      await api.markAllNotificationsRead();
    } catch {
      /* refresh poll resyncs */
    } finally {
      setBusyAll(false);
    }
  };

  const handleApprove = async (n: NotificationRecord) => {
    if (!n.runId || !n.approvalId) return;
    setBusyFor(n.id, true);
    try {
      await api.approveApproval({ runId: n.runId, approvalId: n.approvalId });
      void handleDismiss(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyFor(n.id, false);
    }
  };
  const handleReject = async (n: NotificationRecord) => {
    if (!n.runId || !n.approvalId) return;
    setBusyFor(n.id, true);
    try {
      await api.rejectApproval({ runId: n.runId, approvalId: n.approvalId });
      void handleDismiss(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyFor(n.id, false);
    }
  };
  const handleRetry = async (n: NotificationRecord) => {
    if (!n.runId) return;
    setBusyFor(n.id, true);
    try {
      await api.retryRun(n.runId);
      void handleMarkRead(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyFor(n.id, false);
    }
  };

  // ── Filter + bucket derivation ─
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    const f = FILTERS.find((x) => x.id === filter);
    if (!f?.kinds) return items;
    return items.filter((n) => f.kinds!.includes(classifyKind(n)));
  }, [items, filter]);

  const grouped = useMemo(() => {
    const buckets: Record<Bucket, NotificationRecord[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const n of filtered) {
      buckets[bucketOf(n.createdAt)].push(n);
    }
    return buckets;
  }, [filtered]);

  const unread = items.filter((n) => !n.readAt).length;
  const counts = useMemo(() => {
    const c: Record<FilterId, number> = {
      all: items.length,
      approval: 0,
      runs: 0,
      system: 0,
    };
    for (const n of items) {
      const k = classifyKind(n);
      for (const f of FILTERS) {
        if (f.id === "all") continue;
        if (f.kinds?.includes(k)) c[f.id] += 1;
      }
    }
    return c;
  }, [items]);

  const handleOpen = (n: NotificationRecord) => {
    if (!n.readAt) void handleMarkRead(n);
    onOpenNotification(n);
    onClose();
  };

  // Render to a portal at <body> so neither the TopBar's `backdrop-filter`
  // nor any other ancestor stacking context can turn this `position: fixed`
  // panel into a containing-block descendant (which silently clamps the
  // drawer to the TopBar's 56-px height and hides every card).
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        aria-hidden={!open}
        className={cn(
          "fixed top-0 right-0 bottom-0 z-[70] w-[440px] max-w-[92vw] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Edge glow */}
        <div
          className="absolute -left-32 top-0 bottom-0 w-32 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 50% at 100% 50%, rgba(167,139,250,0.18), transparent 70%)",
          }}
        />
        <div className="h-full flex flex-col drawer-surface border-l border-white/[0.08]">
          {/* ── Header ─ */}
          <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow mb-1.5">
                  Inbox · {items.length} total
                </div>
                <h2 className="text-display text-[26px] leading-tight">
                  {unread > 0 ? (
                    <>
                      <em className="text-display italic text-violet-soft">
                        {unread}
                      </em>{" "}
                      new
                    </>
                  ) : (
                    "All caught up"
                  )}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleMarkAll()}
                  disabled={unread === 0 || busyAll}
                  className="text-[11.5px] text-fog-400 hover:text-fog-100 disabled:opacity-40 disabled:hover:text-fog-400 px-2 py-1 rounded-md whitespace-nowrap"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg hover:bg-white/[0.06] text-fog-300 hover:text-fog-100 flex items-center justify-center"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.7} />
                </button>
              </div>
            </div>
            {/* Filter tabs */}
            <div className="mt-4 flex items-center gap-1">
              {FILTERS.map((f) => {
                const active = f.id === filter;
                const count = counts[f.id];
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "h-7 px-2.5 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition",
                      active
                        ? "bg-white/[0.07] text-fog-100 border border-white/[0.1]"
                        : "text-fog-400 hover:text-fog-100 border border-transparent",
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "mono text-[10px] tabular-nums",
                        active ? "text-fog-300" : "text-fog-500",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Body ─ */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
            {error ? (
              <div className="mx-2 mb-2 rounded-md border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[11.5px] text-rose-300">
                {error}
              </div>
            ) : null}
            {grouped.today.length > 0 ? (
              <BucketGroup
                title="Today"
                items={grouped.today}
                busy={busy}
                onOpen={handleOpen}
                onMarkRead={(n) => void handleMarkRead(n)}
                onDismiss={(n) => void handleDismiss(n)}
                onApprove={(n) => void handleApprove(n)}
                onReject={(n) => void handleReject(n)}
                onRetry={(n) => void handleRetry(n)}
              />
            ) : null}
            {grouped.yesterday.length > 0 ? (
              <BucketGroup
                title="Yesterday"
                items={grouped.yesterday}
                busy={busy}
                onOpen={handleOpen}
                onMarkRead={(n) => void handleMarkRead(n)}
                onDismiss={(n) => void handleDismiss(n)}
                onApprove={(n) => void handleApprove(n)}
                onReject={(n) => void handleReject(n)}
                onRetry={(n) => void handleRetry(n)}
              />
            ) : null}
            {grouped.earlier.length > 0 ? (
              <BucketGroup
                title="Earlier"
                items={grouped.earlier}
                busy={busy}
                onOpen={handleOpen}
                onMarkRead={(n) => void handleMarkRead(n)}
                onDismiss={(n) => void handleDismiss(n)}
                onApprove={(n) => void handleApprove(n)}
                onReject={(n) => void handleReject(n)}
                onRetry={(n) => void handleRetry(n)}
              />
            ) : null}
            {filtered.length === 0 && !error ? (
              <EmptyState filter={filter} />
            ) : null}
          </div>

          {/* ── Footer ─ */}
          <div className="px-5 py-3 border-t border-white/[0.06] shrink-0 flex items-center justify-between text-[11.5px]">
            <span className="text-fog-400 flex items-center gap-1.5">
              <span
                className={cn(
                  "pulse-dot",
                  sseConnected ? "text-emerald-400" : "text-fog-500",
                )}
              />{" "}
              {sseConnected
                ? "Live stream connected"
                : "Live stream connecting…"}
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="text-fog-300 hover:text-fog-100 flex items-center gap-1"
            >
              <SettingsIcon className="h-3 w-3" strokeWidth={1.7} />{" "}
              Notification settings
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
}

// ── Bucket group ─────────────────────────────────────────────────────────

type ItemHandlers = {
  busy: Record<string, true>;
  onOpen: (n: NotificationRecord) => void;
  onMarkRead: (n: NotificationRecord) => void;
  onDismiss: (n: NotificationRecord) => void;
  onApprove: (n: NotificationRecord) => void;
  onReject: (n: NotificationRecord) => void;
  onRetry: (n: NotificationRecord) => void;
};

function BucketGroup({
  title,
  items,
  ...handlers
}: {
  title: string;
  items: NotificationRecord[];
} & ItemHandlers) {
  return (
    <section>
      <div className="px-2 mb-2 flex items-center gap-3">
        <span className="eyebrow">{title}</span>
        <span className="h-px flex-1 bg-white/[0.05]" />
        <span className="mono text-[10.5px] text-fog-500">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <NotificationItem key={n.id} n={n} {...handlers} />
        ))}
      </div>
    </section>
  );
}

// ── Single notification card ─────────────────────────────────────────────

function NotificationItem({
  n,
  busy,
  onOpen,
  onMarkRead,
  onDismiss,
  onApprove,
  onReject,
  onRetry,
}: { n: NotificationRecord } & ItemHandlers) {
  const kind = classifyKind(n);
  const meta = KIND_META[kind];
  const tone = TONE_BG[meta.tone];
  const Icon = meta.icon;
  const isUrgent = kind === "approval" || kind === "failed";
  const read = n.readAt !== null;
  const isBusy = !!busy[n.id];
  const riskLabel = readRisk(n);
  const categoryChip = categoryChipLabel(n);

  // Build the action button set per kind. Order matches the design:
  // primary call-to-action first, secondary next, "Open" last, then a
  // right-aligned dismiss.
  const actions: { node: React.ReactNode; key: string }[] = [];

  if (kind === "approval" && n.runId && n.approvalId) {
    actions.push({
      key: "approve",
      node: (
        <button
          type="button"
          disabled={isBusy}
          onClick={(e) => {
            e.stopPropagation();
            onApprove(n);
          }}
          className="h-7 px-2.5 rounded-md bg-gradient-to-b from-violet-mid to-violet-deep text-white text-[11.5px] font-medium flex items-center gap-1.5 whitespace-nowrap ring-1 ring-violet-soft/35 disabled:opacity-50"
        >
          <Check className="h-3 w-3" strokeWidth={1.7} /> Approve
        </button>
      ),
    });
    actions.push({
      key: "reject",
      node: (
        <button
          type="button"
          disabled={isBusy}
          onClick={(e) => {
            e.stopPropagation();
            onReject(n);
          }}
          className="h-7 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-fog-100 text-[11.5px] font-medium flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
        >
          Reject
        </button>
      ),
    });
  }

  if (kind === "failed" && n.runId) {
    actions.push({
      key: "retry",
      node: (
        <button
          type="button"
          disabled={isBusy}
          onClick={(e) => {
            e.stopPropagation();
            onRetry(n);
          }}
          className="h-7 px-2.5 rounded-md bg-transparent hover:bg-white/[0.04] border border-white/10 text-fog-200 text-[11.5px] font-medium flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
        >
          <Play className="h-3 w-3" strokeWidth={1.7} /> Retry
        </button>
      ),
    });
  }

  if (kind === "system" && n.category === "scheduler") {
    actions.push({
      key: "preview",
      node: (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(n);
          }}
          className="h-7 px-2.5 rounded-md bg-transparent hover:bg-white/[0.04] border border-white/10 text-fog-200 text-[11.5px] font-medium flex items-center gap-1.5 whitespace-nowrap"
        >
          <Eye className="h-3 w-3" strokeWidth={1.7} /> Preview
        </button>
      ),
    });
  }

  if (n.runId || n.taskId) {
    actions.push({
      key: "open",
      node: (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(n);
          }}
          className="h-7 px-2.5 rounded-md bg-transparent hover:bg-white/[0.04] border border-white/10 text-fog-200 text-[11.5px] font-medium flex items-center gap-1.5 whitespace-nowrap"
        >
          {n.actionLabel ?? "Open"}{" "}
          <ArrowUpRight className="h-3 w-3" strokeWidth={1.7} />
        </button>
      ),
    });
  }

  const hasMeta = !!n.runId || !!n.taskId || !!categoryChip || !!riskLabel;

  return (
    <article
      onClick={() => {
        if (!read) onMarkRead(n);
      }}
      className={cn(
        "group relative rounded-xl border px-3.5 py-3 transition cursor-pointer",
        isUrgent
          ? "border-amber-400/25 bg-amber-500/[0.05]"
          : read
            ? "border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04]"
            : "border-white/[0.11] bg-white/[0.045] hover:bg-white/[0.06]",
      )}
    >
      {!read ? (
        <span className="absolute left-[-1px] top-3 bottom-3 w-[2px] rounded-r-full bg-violet-soft" />
      ) : null}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "w-8 h-8 rounded-lg ring-1 flex items-center justify-center shrink-0 mt-0.5",
            tone.soft,
            tone.ring,
            tone.text,
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3
              className={cn(
                "text-[13.5px] font-medium leading-snug truncate",
                read ? "text-fog-200" : "text-fog-100",
              )}
            >
              {n.title}
            </h3>
            <span className="mono text-[10.5px] text-fog-500 shrink-0 ml-auto whitespace-nowrap">
              {relShort(n.createdAt)}
            </span>
          </div>
          {n.message ? (
            <p className="text-[12px] text-fog-400 leading-snug mt-1">
              {n.message}
            </p>
          ) : null}
          {hasMeta ? (
            <div className="flex items-center gap-2 mt-2 text-[10.5px] text-fog-500 flex-wrap">
              {n.runId ? <span className="mono">{n.runId}</span> : null}
              {n.taskId && !n.runId ? (
                <span className="mono">{n.taskId}</span>
              ) : null}
              {categoryChip ? (
                <Chip tone={meta.tone === "violet" ? "violet" : meta.tone}>
                  {categoryChip}
                </Chip>
              ) : null}
              {riskLabel ? (
                <Chip tone={riskLabel === "high" ? "rose" : "amber"}>
                  {riskLabel} risk
                </Chip>
              ) : null}
            </div>
          ) : null}
          {actions.length > 0 ? (
            <div
              className="flex items-center gap-1.5 mt-3 flex-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              {actions.map((a) => (
                <span key={a.key}>{a.node}</span>
              ))}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(n);
                }}
                className="ml-auto text-[10.5px] text-fog-500 hover:text-fog-300 px-1.5 py-1 rounded-md"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div
              className="flex items-center justify-end mt-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(n);
                }}
                className="text-[10.5px] text-fog-500 hover:text-fog-300 px-1.5 py-1 rounded-md"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function categoryChipLabel(n: NotificationRecord): string | null {
  const map: Partial<Record<NotificationCategory, string>> = {
    approval: "approval",
    review: "review",
    validation: "validation",
    scheduler: "scheduler",
    conflict: "conflict",
    gateway: "gateway",
  };
  return map[n.category] ?? null;
}

function readRisk(n: NotificationRecord): "low" | "medium" | "high" | null {
  const meta = n.metadata as Record<string, unknown> | undefined;
  const raw = meta?.riskLevel ?? meta?.risk;
  if (typeof raw === "string" && ["low", "medium", "high"].includes(raw)) {
    return raw as "low" | "medium" | "high";
  }
  return null;
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterId }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-2xl bg-violet-soft/10 ring-1 ring-violet-soft/25 text-violet-soft flex items-center justify-center mb-3">
        <Check className="h-4 w-4" strokeWidth={1.7} />
      </div>
      <div className="text-display text-[22px] leading-tight">
        Nothing here.
      </div>
      <div className="text-[12.5px] text-fog-400 mt-1.5 max-w-[260px]">
        {filter === "all"
          ? "Your inbox is empty. New events from your crew will land here in real time."
          : 'No items match this filter. Try "All" to see everything.'}
      </div>
    </div>
  );
}
