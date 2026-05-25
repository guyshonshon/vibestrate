import { Check, Scale, X } from "lucide-react";
import { Chip, KBD } from "../../design/Chip.js";
import { cn } from "../../design/cn.js";
import { Button } from "../../design/Button.js";
import { SectionEyebrow } from "../../design/SectionEyebrow.js";
import { relTime } from "../../design/format.js";
import type {
  ApprovalRequest,
  NotificationRecord,
  RunState,
  SchedulerState,
} from "../../../lib/types.js";

type ApprovalRow = ApprovalRequest & { runId: string };

export function ApprovalsCard({
  approvals,
  onOpenRun,
  onApprove,
  onReject,
}: {
  approvals: ApprovalRow[];
  onOpenRun: (runId: string) => void;
  onApprove: (a: ApprovalRow) => void;
  onReject: (a: ApprovalRow) => void;
}) {
  const top = approvals[0] ?? null;
  return (
    <div className="glass p-4 fade-up fade-up-delay-2">
      <SectionEyebrow className="mb-3">
        <span className={approvals.length > 0 ? "text-amber-300" : ""}>
          {approvals.length > 0
            ? `Awaiting your call · ${approvals.length}`
            : "Approvals"}
        </span>
      </SectionEyebrow>
      {top ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.05] p-3.5 space-y-3">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-md bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
              <Scale className="h-3.5 w-3.5" strokeWidth={1.7} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-fog-100 font-medium leading-snug">
                {top.requestedAction || top.reason || "Approval required"}
              </div>
              {top.userMessage ? (
                <div className="text-[11.5px] text-fog-400 mt-0.5 line-clamp-2">
                  {top.userMessage}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 text-fog-400">
              <span className="mono">{top.runId}</span>
              <span>·</span>
              <span>{relTime(top.createdAt)}</span>
            </div>
            <Chip tone={top.riskLevel === "high" ? "rose" : "amber"}>
              {top.riskLevel} risk
            </Chip>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Check className="h-3 w-3" strokeWidth={1.7} />}
              onClick={() => onApprove(top)}
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<X className="h-3 w-3" strokeWidth={1.7} />}
              onClick={() => onReject(top)}
            >
              Reject
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={() => onOpenRun(top.runId)}
            >
              Open
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-[13px] text-fog-400">No pending approvals.</div>
      )}
    </div>
  );
}

export function WorkspaceCard({
  runs,
  scheduler,
}: {
  runs: RunState[];
  scheduler: SchedulerState | null;
}) {
  const active = runs.filter((r) =>
    [
      "planning",
      "architecting",
      "executing",
      "validating",
      "reviewing",
      "fixing",
      "verifying",
    ].includes(r.status),
  ).length;
  const today = runs.filter((r) => {
    const t = new Date(r.startedAt);
    const now = new Date();
    return (
      t.getFullYear() === now.getFullYear() &&
      t.getMonth() === now.getMonth() &&
      t.getDate() === now.getDate()
    );
  }).length;
  const blocked = runs.filter((r) => r.status === "waiting_for_approval").length;
  const providerHist = providerUsage(runs);
  return (
    <div className="glass p-4 fade-up fade-up-delay-3">
      <SectionEyebrow className="mb-3">
        <span>Workspace</span>
        {scheduler ? (
          <span
            className="flex items-center gap-1.5 text-emerald-300/90"
            title="Scheduler is running"
          >
            <span className="pulse-dot" />
          </span>
        ) : (
          <span className="mono text-fog-400">scheduler off</span>
        )}
      </SectionEyebrow>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Active" value={String(active)} />
        <Stat label="Blocked" value={String(blocked)} tone="amber" />
        <Stat label="Today" value={String(today)} tone="emerald" />
      </div>
      <div className="mt-4 space-y-2">
        {providerHist.length === 0 ? (
          <div className="text-[11.5px] text-fog-500">No provider history yet.</div>
        ) : (
          providerHist.map((row) => (
            <ProgressRow
              key={row.label}
              label={row.label}
              value={row.pct}
              tone="violet"
            />
          ))
        )}
      </div>
    </div>
  );
}

export function ShortcutsCard() {
  const items: { keys: string[]; label: string }[] = [
    { keys: ["⌘", "K"], label: "Quick jump" },
    { keys: ["⌘", "⏎"], label: "Send to crew" },
    { keys: ["/"], label: "Focus brief" },
    { keys: ["G", "F"], label: "Open flow builder" },
  ];
  return (
    <div className="glass p-4 fade-up fade-up-delay-4">
      <SectionEyebrow className="mb-3">
        <span>Keyboard</span>
      </SectionEyebrow>
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-center justify-between text-[12px]"
          >
            <span className="text-fog-300">{it.label}</span>
            <span className="flex items-center gap-1">
              {it.keys.map((k) => (
                <KBD key={k}>{k}</KBD>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotificationsCard({
  notifications,
  onOpen,
}: {
  notifications: NotificationRecord[];
  onOpen: (n: NotificationRecord) => void;
}) {
  if (notifications.length === 0) return null;
  return (
    <div className="glass p-4 fade-up fade-up-delay-4">
      <SectionEyebrow className="mb-3">
        <span>Inbox · {notifications.filter((n) => !n.readAt).length} unread</span>
      </SectionEyebrow>
      <ul className="space-y-2 max-h-[260px] overflow-y-auto">
        {notifications.slice(0, 6).map((n) => (
          <li
            key={n.id}
            onClick={() => onOpen(n)}
            className={cn(
              "rounded-lg border px-3 py-2 cursor-pointer text-[12px]",
              !n.readAt
                ? "border-violet-soft/30 bg-violet-500/[0.04] text-fog-100"
                : "border-white/[0.05] bg-white/[0.02] text-fog-300 hover:text-fog-100",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{n.title}</span>
              <span className="mono text-[10.5px] text-fog-500 shrink-0">
                {relTime(n.createdAt)}
              </span>
            </div>
            {n.message ? (
              <div className="text-[11.5px] text-fog-400 truncate mt-0.5">
                {n.message}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "emerald" | "violet" | "amber";
}) {
  const tones = {
    neutral: "text-fog-100",
    emerald: "text-emerald-300",
    violet: "text-violet-soft",
    amber: "text-amber-300",
  };
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
      <div
        className={cn(
          "text-[22px] font-semibold tracking-tight num-tabular",
          tones[tone],
        )}
      >
        {value}
      </div>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-fog-500">
        {label}
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "sky" | "amber" | "emerald";
}) {
  const tones: Record<typeof tone, string> = {
    violet: "bg-violet-soft",
    sky: "bg-sky-glow",
    amber: "bg-amber-300",
    emerald: "bg-emerald-400",
  };
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px] mb-1">
        <span className="text-fog-300 truncate">{label}</span>
        <span className="mono text-fog-400 num-tabular ml-2">{value}%</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn("h-full rounded-full", tones[tone])}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function providerUsage(
  runs: RunState[],
): { label: string; pct: number }[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of runs) {
    const id = r.resolvedProviderId ?? r.providerOverride ?? null;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({
      label,
      pct: Math.max(2, Math.round((count / total) * 100)),
    }));
}
