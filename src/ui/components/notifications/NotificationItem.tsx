import {
  AlertTriangle,
  AlertOctagon,
  Bell,
  CheckCircle2,
  Info,
  Eye,
  Check,
} from "lucide-react";
import type {
  NotificationRecord,
  NotificationSeverity,
} from "../../lib/types.js";

const SEVERITY_ICON: Record<NotificationSeverity, typeof Bell> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  attention: Bell,
  critical: AlertOctagon,
};

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  info: "text-amaco-fg-dim",
  success: "text-amaco-success",
  warning: "text-amaco-warn",
  attention: "text-amaco-accent",
  critical: "text-amaco-fail",
};

type Props = {
  notification: NotificationRecord;
  onMarkRead: (id: string) => void;
  onResolve: (id: string) => void;
  onOpen: (n: NotificationRecord) => void;
};

export function NotificationItem({
  notification,
  onMarkRead,
  onResolve,
  onOpen,
}: Props) {
  const Icon = SEVERITY_ICON[notification.severity];
  const color = SEVERITY_COLOR[notification.severity];
  const unread = notification.readAt === null;

  return (
    <div
      className={`flex gap-2.5 border-b border-amaco-border px-3 py-2.5 ${
        unread ? "bg-amaco-panel-2/40" : ""
      }`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => onOpen(notification)}
            className="block min-w-0 flex-1 text-left"
          >
            <div className="truncate text-[12.5px] font-medium text-amaco-fg">
              {notification.title}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] text-amaco-fg-dim">
              {notification.message}
            </div>
          </button>
          {unread ? (
            <span
              aria-label="unread"
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amaco-accent"
            />
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="amaco-mono rounded border border-amaco-border px-1 py-0.5 text-[10px] text-amaco-fg-muted">
            {notification.category}
          </span>
          {notification.runId ? (
            <span className="amaco-mono rounded border border-amaco-border px-1 py-0.5 text-[10px] text-amaco-fg-muted">
              run {notification.runId}
            </span>
          ) : null}
          {notification.taskId ? (
            <span className="amaco-mono rounded border border-amaco-border px-1 py-0.5 text-[10px] text-amaco-fg-muted">
              task {notification.taskId}
            </span>
          ) : null}
          <span className="ml-auto amaco-mono text-[10px] text-amaco-fg-muted">
            {new Date(notification.createdAt).toLocaleTimeString()}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          {unread ? (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              className="inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-amaco-fg-dim hover:bg-amaco-panel-2"
            >
              <Eye className="h-3 w-3" strokeWidth={1.5} />
              Mark read
            </button>
          ) : null}
          {notification.resolvedAt === null ? (
            <button
              type="button"
              onClick={() => onResolve(notification.id)}
              className="inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-amaco-fg-dim hover:bg-amaco-panel-2"
            >
              <Check className="h-3 w-3" strokeWidth={1.5} />
              Resolve
            </button>
          ) : (
            <span className="amaco-mono text-[10px] text-amaco-fg-muted">
              resolved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
