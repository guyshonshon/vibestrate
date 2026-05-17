import { forwardRef, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CheckSquare,
  ChevronRight,
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
  onApproveApproval: (a: ApprovalRequest & { runId: string }) => Promise<void>;
  onRejectApproval: (a: ApprovalRequest & { runId: string }) => Promise<void>;
  onMarkNotificationRead: (n: NotificationRecord) => Promise<void>;
};

/**
 * Six numbered panels rendered as a tall grid. Each panel has a number
 * badge ([1]–[6]) that doubles as a focus shortcut via the
 * `useNumberedNav` hook in the parent. Empty states are substantive —
 * they tell the user what to do next, not just "nothing here".
 */
export function SecondaryPanels(props: SecondaryPanelsProps) {
  const backlog = props.tasks.filter((t) => t.status === "backlog");
  const ready = props.tasks.filter((t) => t.status === "ready");
  const groups = groupNotifications(props.notifications);

  return (
    <div className="grid gap-3 px-6 pb-6 lg:grid-cols-2 2xl:grid-cols-3">
      <Panel
        index={1}
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
            primaryLabel="queue"
          />
        ))}
      </Panel>

      <Panel
        index={2}
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
            primaryLabel="queue"
          />
        ))}
      </Panel>

      <Panel
        index={3}
        id="panel-queue"
        title="Queue"
        icon={<ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} />}
        count={props.queue.length}
        emptyHint="The scheduler picks from here. Add tasks with /queue <id>."
      >
        {props.queue.slice(0, 8).map((e) => {
          const t = props.tasks.find((x) => x.id === e.taskId);
          return (
            <button
              key={e.taskId}
              type="button"
              onClick={() => props.onOpenTask(e.taskId)}
              className="flex w-full items-start justify-between gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1.5 text-left hover:bg-amaco-panel focus:outline-none focus:ring-1 focus:ring-amaco-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-amaco-fg">
                  {t?.title ?? e.taskId}
                </div>
                <div className="amaco-mono mt-0.5 text-[10px] text-amaco-fg-muted">
                  priority {e.priority} · age {ageOf(e.enqueuedAt)} · {e.source}
                </div>
              </div>
              <ChevronRight
                className="mt-0.5 h-4 w-4 shrink-0 text-amaco-fg-dim"
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
          );
        })}
      </Panel>

      <Panel
        index={4}
        id="panel-approvals"
        title="Approvals"
        icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />}
        count={props.approvals.length}
        tone={props.approvals.length > 0 ? "warn" : undefined}
        emptyHint="When an agent pauses for a decision, you'll approve/reject here."
      >
        {props.approvals.slice(0, 6).map((a) => (
          <article
            key={a.id}
            className="rounded border border-amaco-warn/40 bg-amaco-warn/5 p-2"
          >
            <button
              type="button"
              onClick={() => props.onOpenRun(a.runId)}
              className="block w-full truncate text-left text-[12px] font-medium text-amaco-fg hover:text-amaco-warn"
            >
              {a.stageId}
              {a.requestedAction ? ` · ${a.requestedAction}` : ""}
              <span className="amaco-mono ml-1 text-[10px] text-amaco-fg-muted">
                {a.runId}
              </span>
            </button>
            {a.userMessage || a.reason ? (
              <div className="mt-0.5 line-clamp-2 text-[11.5px] text-amaco-fg-dim">
                {a.userMessage ?? a.reason}
              </div>
            ) : null}
            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void props.onApproveApproval(a)}
                className="rounded border border-amaco-success/40 bg-amaco-success/10 px-2 py-0.5 text-[11px] font-medium text-amaco-success hover:bg-amaco-success/20"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void props.onRejectApproval(a)}
                className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-0.5 text-[11px] font-medium text-amaco-fail hover:bg-amaco-fail/20"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => props.onOpenRun(a.runId)}
                className="ml-auto text-[10.5px] text-amaco-fg-muted hover:text-amaco-fg"
              >
                open run →
              </button>
            </div>
          </article>
        ))}
      </Panel>

      <Panel
        index={5}
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

      <Panel
        index={6}
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
    </div>
  );
}

const Panel = forwardRef<
  HTMLElement,
  {
    index: 1 | 2 | 3 | 4 | 5 | 6;
    id: string;
    title: string;
    icon: ReactNode;
    count: number;
    tone?: "warn";
    emptyHint: string;
    children: ReactNode;
  }
>(function Panel({ index, id, title, icon, count, tone, emptyHint, children }, ref) {
  // Make the section programmatically focusable for the numbered-nav hook.
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
      className="rounded-md border border-amaco-border bg-amaco-panel scroll-mt-4 focus:outline-none focus:ring-1 focus:ring-amaco-accent"
    >
      <header className="flex items-center gap-2 border-b border-amaco-border-soft px-3 py-2">
        <span
          aria-hidden
          className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[10px] text-amaco-fg-muted"
          title={`Press ${index} to focus`}
        >
          {index}
        </span>
        <span className={`inline-flex items-center gap-1.5 ${headerTone}`}>
          {icon}
          <span
            id={`${id}-title`}
            className="amaco-mono text-[10.5px] uppercase tracking-[0.14em]"
          >
            {title}
          </span>
        </span>
        <span className="amaco-mono ml-auto text-[10.5px] text-amaco-fg-muted">
          {count}
        </span>
      </header>
      <div className="flex flex-col gap-1.5 p-2">
        {count === 0 ? (
          <p className="text-[11.5px] text-amaco-fg-muted">{emptyHint}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
});

function TaskRow({
  task,
  onOpen,
  onPrimary,
  primaryLabel,
}: {
  task: Task;
  onOpen: () => void;
  onPrimary: () => void;
  primaryLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left text-[12px] text-amaco-fg hover:text-amaco-accent focus:outline-none"
        title={task.title}
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
