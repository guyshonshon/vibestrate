import { forwardRef, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Inbox,
  Layers,
  ListChecks,
  Play,
} from "lucide-react";
import type {
  ApprovalRequest,
  NotificationRecord,
  QueueEntry,
  ReviewSuggestion,
  Task,
} from "../../lib/types.js";
import {
  groupNotifications,
  type NotificationGroup,
} from "./groupNotifications.js";
import { usePersistedState } from "../../lib/usePersistedState.js";
import {
  ContextMenuTrigger,
  type ContextMenuItem,
} from "../ContextMenu.js";
import { cliFor, type UiAction } from "../../lib/cliFor.js";

export type PanelKey =
  | "backlog"
  | "ready"
  | "queue"
  | "approvals"
  | "suggestions"
  | "notifications";

export type SecondaryPanelsProps = {
  tasks: Task[];
  queue: QueueEntry[];
  approvals: (ApprovalRequest & { runId: string })[];
  suggestions: (ReviewSuggestion & { runId: string })[];
  notifications: NotificationRecord[];
  onOpenTask: (taskId: string) => void;
  onOpenRun: (runId: string) => void;
  onQueueTask: (taskId: string) => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onTerminateTask: (taskId: string) => Promise<void>;
  onApproveApproval: (a: ApprovalRequest & { runId: string }) => Promise<void>;
  onRejectApproval: (a: ApprovalRequest & { runId: string }) => Promise<void>;
  onMarkNotificationRead: (n: NotificationRecord) => Promise<void>;
};

const DEFAULT_ORDER: PanelKey[] = [
  "backlog",
  "ready",
  "queue",
  "approvals",
  "suggestions",
  "notifications",
];

const NUMBERS: Record<PanelKey, 1 | 2 | 3 | 4 | 5 | 6> = {
  backlog: 1,
  ready: 2,
  queue: 3,
  approvals: 4,
  suggestions: 5,
  notifications: 6,
};

/**
 * Six secondary panels. The user can:
 *   - drag the grip handle on each header to reorder
 *   - click the chevron to collapse / expand
 * Both states persist per-browser via localStorage. Order is also
 * keyed to the numbered-nav hook (`[N]` badge stays aligned with the
 * PanelKey it was assigned to, not the visual position — so muscle
 * memory survives reorders).
 */
export function SecondaryPanels(props: SecondaryPanelsProps) {
  const backlog = props.tasks.filter((t) => t.status === "backlog");
  const ready = props.tasks.filter((t) => t.status === "ready");
  const groups = groupNotifications(props.notifications);

  const [order, setOrder] = usePersistedState<PanelKey[]>(
    "amaco.mission.panels.order",
    DEFAULT_ORDER,
  );
  const [collapsed, setCollapsed] = usePersistedState<Record<PanelKey, boolean>>(
    "amaco.mission.panels.collapsed",
    {} as Record<PanelKey, boolean>,
  );

  // Heal corrupt / outdated persisted order (e.g. missing or duplicate
  // keys after a release added/removed a panel).
  useEffect(() => {
    const known = new Set(DEFAULT_ORDER);
    const filtered = order.filter((k) => known.has(k));
    const missing = DEFAULT_ORDER.filter((k) => !filtered.includes(k));
    const healed = [...filtered, ...missing];
    if (
      healed.length !== order.length ||
      healed.some((k, i) => k !== order[i])
    ) {
      setOrder(healed);
    }
  }, [order, setOrder]);

  const [dragKey, setDragKey] = useState<PanelKey | null>(null);
  // `hoverKey` drives the live drop-indicator: while dragging, the
  // panel the cursor is currently over highlights as the insertion
  // target so the user can see exactly where it will land.
  const [hoverKey, setHoverKey] = useState<PanelKey | null>(null);
  const onPanelDrop = (target: PanelKey) => {
    if (!dragKey || dragKey === target) {
      setHoverKey(null);
      setDragKey(null);
      return;
    }
    setOrder((cur) => {
      const next = cur.filter((k) => k !== dragKey);
      const idx = next.indexOf(target);
      next.splice(idx, 0, dragKey);
      return next;
    });
    setHoverKey(null);
    setDragKey(null);
  };

  const toggleCollapsed = (k: PanelKey) =>
    setCollapsed((cur) => ({ ...cur, [k]: !cur[k] }));

  const renderPanel = (k: PanelKey): ReactNode => {
    const isCollapsed = !!collapsed[k];
    const shared = {
      panelKey: k,
      index: NUMBERS[k],
      isCollapsed,
      onToggleCollapse: () => toggleCollapsed(k),
      onDragStart: () => setDragKey(k),
      onDragEnd: () => {
        setDragKey(null);
        setHoverKey(null);
      },
      onDragOver: () => {
        if (dragKey && dragKey !== k) setHoverKey(k);
      },
      onDragLeave: () => {
        if (hoverKey === k) setHoverKey(null);
      },
      onDrop: () => onPanelDrop(k),
      isDragging: dragKey === k,
      isHoverTarget: dragKey !== null && dragKey !== k && hoverKey === k,
    };

    switch (k) {
      case "backlog":
        return (
          <Panel
            key="backlog"
            {...shared}
            id="panel-backlog"
            title="Backlog"
            icon={<Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />}
            count={backlog.length}
            emptyHint="Type /task <title> in the composer to file an idea here."
          >
            {backlog.slice(0, 6).map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onOpen={() => props.onOpenTask(t.id)}
                onPrimary={() => void props.onQueueTask(t.id)}
                onCancel={() => void props.onCancelTask(t.id)}
                onTerminate={() => void props.onTerminateTask(t.id)}
                primaryLabel="queue"
              />
            ))}
          </Panel>
        );
      case "ready":
        return (
          <Panel
            key="ready"
            {...shared}
            id="panel-ready"
            title="Ready"
            icon={<CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} />}
            count={ready.length}
            emptyHint="Tasks you mark ready show up here, one click from queueing."
          >
            {ready.slice(0, 6).map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onOpen={() => props.onOpenTask(t.id)}
                onPrimary={() => void props.onQueueTask(t.id)}
                onCancel={() => void props.onCancelTask(t.id)}
                onTerminate={() => void props.onTerminateTask(t.id)}
                primaryLabel="queue"
              />
            ))}
          </Panel>
        );
      case "queue":
        return (
          <Panel
            key="queue"
            {...shared}
            id="panel-queue"
            title="Queue"
            icon={<ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} />}
            count={props.queue.length}
            emptyHint="The scheduler picks from here. Add tasks with /queue <id>."
          >
            {props.queue.slice(0, 8).map((e) => {
              const t = props.tasks.find((x) => x.id === e.taskId);
              return (
                <QueueRow
                  key={e.taskId}
                  entry={e}
                  title={t?.title ?? e.taskId}
                  onOpen={() => props.onOpenTask(e.taskId)}
                />
              );
            })}
          </Panel>
        );
      case "approvals":
        return (
          <Panel
            key="approvals"
            {...shared}
            id="panel-approvals"
            title="Approvals"
            icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />}
            count={props.approvals.length}
            tone={props.approvals.length > 0 ? "warn" : undefined}
            emptyHint="When an agent pauses for a decision, you'll approve/reject here."
          >
            {props.approvals.slice(0, 6).map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                onOpen={() => props.onOpenRun(a.runId)}
                onApprove={() => void props.onApproveApproval(a)}
                onReject={() => void props.onRejectApproval(a)}
              />
            ))}
          </Panel>
        );
      case "suggestions":
        return (
          <Panel
            key="suggestions"
            {...shared}
            id="panel-suggestions"
            title="Suggestions"
            icon={<Layers className="h-3.5 w-3.5" strokeWidth={1.5} />}
            count={props.suggestions.length}
            emptyHint="Reviewer-generated patches you can apply or skip will appear here."
          >
            {props.suggestions.slice(0, 6).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => props.onOpenRun(s.runId)}
                className="flex w-full flex-col gap-0.5 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5 text-left hover:bg-amaco-panel"
              >
                <span className="truncate text-[12px] text-amaco-fg">
                  {s.title ?? s.id}
                </span>
                <span className="amaco-mono text-[10px] text-amaco-fg-muted">
                  {s.runId}
                </span>
              </button>
            ))}
          </Panel>
        );
      case "notifications":
        return (
          <Panel
            key="notifications"
            {...shared}
            id="panel-notifications"
            title="Notifications"
            icon={<Bell className="h-3.5 w-3.5" strokeWidth={1.5} />}
            count={groups.length}
            emptyHint="System events that need your attention will group here."
          >
            {groups.slice(0, 8).map((g) => (
              <NotificationGroupRow
                key={g.key}
                group={g}
                onOpen={() => {
                  if (g.runIds[0]) props.onOpenRun(g.runIds[0]);
                  void props.onMarkNotificationRead(g.latest);
                }}
              />
            ))}
          </Panel>
        );
    }
  };

  return (
    <div className="grid gap-3 px-6 pb-6 lg:grid-cols-2 2xl:grid-cols-3">
      {order.map((k) => renderPanel(k))}
    </div>
  );
}

// ─── Panel chrome ──────────────────────────────────────────────────────

type PanelProps = {
  panelKey: PanelKey;
  index: 1 | 2 | 3 | 4 | 5 | 6;
  id: string;
  title: string;
  icon: ReactNode;
  count: number;
  tone?: "warn";
  emptyHint: string;
  children: ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  isDragging: boolean;
  isHoverTarget: boolean;
};

const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  {
    panelKey,
    index,
    id,
    title,
    icon,
    count,
    tone,
    emptyHint,
    children,
    isCollapsed,
    onToggleCollapse,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    isDragging,
    isHoverTarget,
  },
  ref,
) {
  const internalRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof ref === "function") ref(internalRef.current);
    else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = internalRef.current;
  }, [ref]);
  const headerTone =
    tone === "warn" && count > 0
      ? "text-amaco-warn"
      : "text-amaco-fg-muted";

  return (
    <section
      ref={internalRef}
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      data-panel={panelKey}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-md border bg-amaco-panel scroll-mt-4 transition-all focus:outline-none focus:ring-1 focus:ring-amaco-accent ${
        isHoverTarget
          ? "border-amaco-accent ring-2 ring-amaco-accent/40"
          : "border-amaco-border"
      } ${isDragging ? "opacity-40 scale-[0.98]" : ""}`}
    >
      <header
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", panelKey);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        title="Drag to reorder · click the chevron to collapse"
        className="flex cursor-grab items-center gap-2 border-b border-amaco-border-soft px-3 py-2 active:cursor-grabbing"
      >
        <span
          aria-label={`Drag handle for ${title}`}
          className="text-amaco-fg-muted hover:text-amaco-fg"
        >
          <GripVertical
            className="h-3.5 w-3.5"
            strokeWidth={1.5}
            aria-hidden
          />
        </span>
        <span
          aria-hidden
          className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[10px] text-amaco-fg-muted"
          title={`Press ${index} to focus`}
        >
          {index}
        </span>
        <button
          type="button"
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          aria-expanded={!isCollapsed}
          aria-controls={`${id}-body`}
          className={`flex flex-1 items-center gap-1.5 text-left ${headerTone} hover:text-amaco-fg`}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          )}
          {icon}
          <span
            id={`${id}-title`}
            className="amaco-mono text-[10.5px] uppercase tracking-[0.14em]"
          >
            {title}
          </span>
        </button>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          {count}
        </span>
      </header>
      {!isCollapsed ? (
        <div id={`${id}-body`} className="flex flex-col gap-1.5 p-2">
          {count === 0 ? (
            <p className="text-[11.5px] text-amaco-fg-muted">{emptyHint}</p>
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
});

// ─── Rows with right-click menus ──────────────────────────────────────

function copy(text: string): void {
  void navigator.clipboard?.writeText?.(text).catch(() => undefined);
}

function cliMenuItem(action: UiAction, label: string): ContextMenuItem | null {
  const cli = cliFor(action);
  if (!cli) return null;
  return {
    id: `cli-${action.kind}`,
    label,
    hint: cli.length > 26 ? `${cli.slice(0, 24)}…` : cli,
    onSelect: () => copy(cli),
  };
}

function TaskRow({
  task,
  onOpen,
  onPrimary,
  onCancel,
  onTerminate,
  primaryLabel,
}: {
  task: Task;
  onOpen: () => void;
  onPrimary: () => void;
  onCancel: () => void;
  onTerminate: () => void;
  primaryLabel: string;
}) {
  const items: ContextMenuItem[] = [
    { id: "open", label: "Open task", hint: "↵", onSelect: onOpen },
    { id: "primary", label: "Queue task", tone: "accent", onSelect: onPrimary },
    { id: "cancel", label: "Cancel task", tone: "danger", onSelect: onCancel },
    {
      id: "terminate",
      label: "Terminate (force)",
      tone: "danger",
      hint: "abort + cancel",
      onSelect: onTerminate,
    },
    { id: "div-cli", label: "divider:" },
    {
      id: "copy-id",
      label: "Copy task id",
      hint: task.id,
      onSelect: () => copy(task.id),
    },
    cliMenuItem({ kind: "queue-task", taskId: task.id }, "Copy CLI: queue"),
    cliMenuItem({ kind: "run-task", taskId: task.id }, "Copy CLI: run"),
    cliMenuItem({ kind: "cancel-task", taskId: task.id }, "Copy CLI: cancel"),
  ].filter((x): x is ContextMenuItem => x !== null);

  return (
    <ContextMenuTrigger items={items}>
      {(h) => (
        <div
          onContextMenu={h.onContextMenu}
          className="flex items-center justify-between gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1"
          title="Right-click for actions + CLI"
        >
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 truncate text-left text-[12px] text-amaco-fg hover:text-amaco-accent focus:outline-none"
          >
            {task.title}
          </button>
          <span className="amaco-mono text-[10px] text-amaco-fg-muted">
            {task.priority[0]}
            {task.effort ? `·${task.effort[0]}` : ""}
          </span>
          <button
            type="button"
            onClick={onPrimary}
            className="amaco-mono inline-flex items-center gap-0.5 rounded border border-amaco-accent/40 px-1.5 py-0.5 text-[10px] text-amaco-accent hover:bg-amaco-accent/10"
          >
            <Play className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
            {primaryLabel}
          </button>
        </div>
      )}
    </ContextMenuTrigger>
  );
}

function QueueRow({
  entry,
  title,
  onOpen,
}: {
  entry: QueueEntry;
  title: string;
  onOpen: () => void;
}) {
  const items: ContextMenuItem[] = [
    { id: "open", label: "Open task", hint: "↵", onSelect: onOpen },
    { id: "div", label: "divider:" },
    {
      id: "copy-id",
      label: "Copy task id",
      hint: entry.taskId,
      onSelect: () => copy(entry.taskId),
    },
    cliMenuItem(
      { kind: "queue-task", taskId: entry.taskId },
      "Copy CLI: queue add",
    ),
    cliMenuItem(
      { kind: "cancel-task", taskId: entry.taskId },
      "Copy CLI: cancel",
    ),
    cliMenuItem({ kind: "run-task", taskId: entry.taskId }, "Copy CLI: run"),
  ].filter((x): x is ContextMenuItem => x !== null);

  return (
    <ContextMenuTrigger items={items}>
      {(h) => (
        <button
          type="button"
          onClick={onOpen}
          onContextMenu={h.onContextMenu}
          className="flex w-full items-start justify-between gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5 text-left hover:bg-amaco-panel focus:outline-none focus:ring-1 focus:ring-amaco-accent"
          title="Right-click for actions + CLI"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] text-amaco-fg">{title}</div>
            <div className="amaco-mono mt-0.5 text-[10px] text-amaco-fg-muted">
              priority {entry.priority} · age {ageOf(entry.enqueuedAt)} ·{" "}
              {entry.source}
            </div>
          </div>
          <ChevronRight
            className="mt-0.5 h-4 w-4 shrink-0 text-amaco-fg-dim"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      )}
    </ContextMenuTrigger>
  );
}

function ApprovalCard({
  approval,
  onOpen,
  onApprove,
  onReject,
}: {
  approval: ApprovalRequest & { runId: string };
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const items: ContextMenuItem[] = [
    { id: "open", label: "Open run", onSelect: onOpen },
    { id: "approve", label: "Approve", tone: "accent", onSelect: onApprove },
    { id: "reject", label: "Reject", tone: "danger", onSelect: onReject },
    { id: "div", label: "divider:" },
    {
      id: "copy-rid",
      label: "Copy run id",
      hint: approval.runId,
      onSelect: () => copy(approval.runId),
    },
    cliMenuItem(
      { kind: "status-run", runId: approval.runId },
      "Copy CLI: status",
    ),
    cliMenuItem(
      { kind: "replay-run", runId: approval.runId },
      "Copy CLI: replay",
    ),
  ].filter((x): x is ContextMenuItem => x !== null);

  return (
    <ContextMenuTrigger items={items}>
      {(h) => (
        <article
          onContextMenu={h.onContextMenu}
          className="rounded border border-amaco-warn/40 bg-amaco-warn/5 p-2"
        >
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-[12px] font-medium text-amaco-fg hover:text-amaco-warn"
          >
            {approval.stageId}
            {approval.requestedAction ? ` · ${approval.requestedAction}` : ""}
            <span className="amaco-mono ml-1 text-[10px] text-amaco-fg-muted">
              {approval.runId}
            </span>
          </button>
          {approval.userMessage || approval.reason ? (
            <div className="mt-0.5 line-clamp-2 text-[11.5px] text-amaco-fg-dim">
              {approval.userMessage ?? approval.reason}
            </div>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onApprove}
              className="rounded border border-amaco-success/40 bg-amaco-success/10 px-2 py-0.5 text-[11px] font-medium text-amaco-success hover:bg-amaco-success/20"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={onReject}
              className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-0.5 text-[11px] font-medium text-amaco-fail hover:bg-amaco-fail/20"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="ml-auto text-[10.5px] text-amaco-fg-muted hover:text-amaco-fg"
            >
              open run →
            </button>
          </div>
        </article>
      )}
    </ContextMenuTrigger>
  );
}

function NotificationGroupRow({
  group,
  onOpen,
}: {
  group: NotificationGroup;
  onOpen: () => void;
}) {
  const sevTone =
    group.severity === "critical"
      ? "border-amaco-fail/50 bg-amaco-fail/10 text-amaco-fail"
      : group.severity === "attention"
        ? "border-amaco-warn/50 bg-amaco-warn/10 text-amaco-warn"
        : group.severity === "warning"
          ? "border-amaco-warn/40 bg-amaco-warn/5 text-amaco-warn"
          : group.severity === "success"
            ? "border-amaco-success/40 bg-amaco-success/5 text-amaco-success"
            : "border-amaco-border bg-amaco-panel-2 text-amaco-fg-dim";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-start justify-between gap-2 rounded border px-2 py-1.5 text-left ${sevTone}`}
    >
      <div className="min-w-0">
        <div className="truncate text-[12px]">{group.message}</div>
        <div className="amaco-mono mt-0.5 text-[10px] opacity-70">
          {group.category} · {group.count}×
          {group.runIds.length > 0 ? ` · ${group.runIds.length} run(s)` : ""}
          {group.unread > 0 ? ` · ${group.unread} unread` : ""}
        </div>
      </div>
      <ChevronRight
        className="mt-0.5 h-4 w-4 shrink-0 opacity-70"
        strokeWidth={1.5}
        aria-hidden
      />
    </button>
  );
}

function ageOf(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
