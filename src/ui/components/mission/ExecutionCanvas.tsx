import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleDot,
  Cpu,
  Hourglass,
  Pause,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type {
  AmacoEvent,
  RunState,
  RunStatus,
} from "../../lib/types.js";
import { PHASES, phaseStates, type PhaseState } from "./phaseRail.js";
import {
  ContextMenuTrigger,
  type ContextMenuItem,
} from "../ContextMenu.js";
import { cliFor, type UiAction } from "../../lib/cliFor.js";

type Props = {
  active: RunState[];
  eventsByRun: Record<string, AmacoEvent[]>;
  /** Per-runId diff summary (insertions / deletions / file count). Optional —
   *  cards just hide the diff chip when missing. */
  diffByRun?: Record<string, { insertions: number; deletions: number; files: number }>;
  onOpen: (runId: string) => void;
  /** Optional deep-link variant — when provided, the diff chip uses it
   *  to open the run with the Diff inspector tab already active. */
  onOpenDiff?: (runId: string) => void;
};

/**
 * Strong visual surface for the orchestrator's current work.
 * For each active run: phase rail, provider, elapsed time, latest
 * decision/event, "what it's waiting on" line. When there are no
 * active runs, a substantive empty state explains how to start one.
 */
export function ExecutionCanvas({
  active,
  eventsByRun,
  diffByRun,
  onOpen,
  onOpenDiff,
}: Props) {
  return (
    <section
      role="region"
      aria-label="Execution canvas"
      className="border-b border-amaco-border bg-amaco-canvas"
    >
      <header className="flex items-center justify-between px-6 py-2 text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        <span>execution · active runs ({active.length})</span>
        <span className="amaco-mono normal-case tracking-normal">
          ↵ open · R re-run
        </span>
      </header>
      {active.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 px-6 pb-4 lg:grid-cols-2 2xl:grid-cols-3">
          {active.map((r) => (
            <RunFlowCard
              key={r.runId}
              run={r}
              events={eventsByRun[r.runId] ?? []}
              diff={diffByRun?.[r.runId] ?? null}
              onOpen={() => onOpen(r.runId)}
              onOpenDiff={
                onOpenDiff ? () => onOpenDiff(r.runId) : () => onOpen(r.runId)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mx-6 mb-4 rounded-md border border-dashed border-amaco-border bg-amaco-panel/40 p-4 text-[12.5px] text-amaco-fg-dim">
      <div className="amaco-mono text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
        nothing running
      </div>
      <div className="mt-1 text-amaco-fg">
        Type a task above and hit Enter — amaco will plan, execute, review,
        verify, and report.
      </div>
      <div className="mt-2 amaco-mono text-[11.5px] text-amaco-fg-muted">
        example:{" "}
        <span className="rounded bg-amaco-panel-2 px-1.5 py-0.5 text-amaco-fg">
          add a /healthz route that returns 200
        </span>
      </div>
    </div>
  );
}

function copy(text: string): void {
  void navigator.clipboard?.writeText?.(text).catch(() => undefined);
}

function cliItem(a: UiAction, label: string): ContextMenuItem | null {
  const c = cliFor(a);
  if (!c) return null;
  return {
    id: `cli-${a.kind}`,
    label,
    hint: c.length > 26 ? `${c.slice(0, 24)}…` : c,
    onSelect: () => copy(c),
  };
}

function RunFlowCard({
  run,
  events,
  diff,
  onOpen,
  onOpenDiff,
}: {
  run: RunState;
  events: AmacoEvent[];
  diff: { insertions: number; deletions: number; files: number } | null;
  onOpen: () => void;
  onOpenDiff: () => void;
}) {
  const menuItems: ContextMenuItem[] = [
    { id: "open", label: "Open run", hint: "↵", onSelect: onOpen },
    { id: "div1", label: "divider:" },
    {
      id: "copy-id",
      label: "Copy run id",
      hint: run.runId,
      onSelect: () => copy(run.runId),
    },
    cliItem({ kind: "status-run", runId: run.runId }, "Copy CLI: status"),
    cliItem({ kind: "replay-run", runId: run.runId }, "Copy CLI: replay"),
    cliItem({ kind: "pause-run", runId: run.runId }, "Copy CLI: pause"),
    cliItem({ kind: "resume-run", runId: run.runId }, "Copy CLI: resume"),
    cliItem({ kind: "abort-run", runId: run.runId }, "Copy CLI: abort"),
    ...(run.worktreePath
      ? [
          { id: "div2", label: "divider:" } as ContextMenuItem,
          {
            id: "copy-wt",
            label: "Copy worktree path",
            onSelect: () => copy(run.worktreePath ?? ""),
          } as ContextMenuItem,
        ]
      : []),
  ].filter((x): x is ContextMenuItem => x !== null);
  const states = phaseStates({
    status: run.status,
    pausedAtStatus: run.approvalRequestedFromStatus ?? null,
  });
  const live = deriveLive(events);
  const provider =
    live.currentProvider ?? run.resolvedProviderId ?? run.providerOverride ?? null;
  const elapsed = elapsedSince(run.startedAt);
  const waitingOn = describeWaiting(run.status, run.error);

  return (
    <ContextMenuTrigger items={menuItems}>
      {(h) => (
    <article
      onContextMenu={h.onContextMenu}
      className="rounded-md border border-amaco-border bg-amaco-panel p-3 hover:border-amaco-accent/40"
      aria-label={`Run ${run.runId} status ${run.status}`}
      title="Right-click for actions + CLI"
    >
      {/* Top row — status pill, task title, open arrow */}
      <header className="flex items-start gap-2">
        <StatusPill status={run.status} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-[13px] font-medium text-amaco-fg hover:text-amaco-accent focus:outline-none"
            title={run.task}
          >
            {run.task}
          </button>
          <div className="amaco-mono mt-0.5 truncate text-[10.5px] text-amaco-fg-muted">
            {run.runId}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open run detail"
          className="shrink-0 text-amaco-fg-dim hover:text-amaco-accent"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </header>

      {/* Phase rail */}
      <PhaseRailRow states={states} />
      {run.guide ? <GuideStepRow run={run} /> : null}

      {/* What it's waiting on */}
      {waitingOn ? (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px]">
          <Hourglass
            className="mt-0.5 h-3 w-3 shrink-0 text-amaco-warn"
            strokeWidth={1.8}
            aria-hidden
          />
          <span className="text-amaco-warn">{waitingOn}</span>
        </div>
      ) : null}

      {/* Latest event preview */}
      {live.lastEvent ? (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-amaco-fg-dim">
          <CircleDot
            className="mt-0.5 h-3 w-3 shrink-0 text-amaco-accent"
            strokeWidth={1.8}
            aria-hidden
          />
          <span className="truncate" title={live.lastEvent.message ?? ""}>
            {live.lastEvent.message ?? live.lastEvent.type}
          </span>
        </div>
      ) : null}

      {/* Bottom row — provider / elapsed / skills */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 amaco-mono text-[10.5px] text-amaco-fg-muted">
        <span className="inline-flex items-center gap-1">
          <Cpu className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          {provider ?? "—"}
        </span>
        {live.currentAgent ? (
          <span className="inline-flex items-center gap-1">
            <TerminalSquare className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            {live.currentAgent}
          </span>
        ) : null}
        {live.currentSkills.length > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-amaco-accent"
            title={`Skills attached to the current agent's prompt:\n${live.currentSkills.join("\n")}\n\n(The provider's model decides whether to actually use them — we surface what was made available.)`}
          >
            <Sparkles className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            {live.currentSkills.length === 1
              ? live.currentSkills[0]
              : `${live.currentSkills.length} skills`}
          </span>
        ) : run.runtimeSkills && run.runtimeSkills.length > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-amaco-fg-muted"
            title={`Run-wide skill attachments (will surface on the next agent):\n${run.runtimeSkills.join("\n")}`}
          >
            <Sparkles className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            +{run.runtimeSkills.length} pending
          </span>
        ) : null}
        {run.concise ? (
          <span
            className="amaco-mono rounded border border-amaco-accent/40 bg-amaco-accent/10 px-1 text-[9.5px] text-amaco-accent"
            title="Concise mode: agents asked to prefer diffs, bullets, no preamble."
          >
            concise
          </span>
        ) : null}
        {diff && (diff.insertions > 0 || diff.deletions > 0) ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDiff();
            }}
            className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel-2 px-1 text-[10px] text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
            title={`${diff.files} file(s) changed · click to open Diff inspector`}
          >
            <span className="text-amaco-success">+{diff.insertions}</span>
            <span className="text-amaco-fail">−{diff.deletions}</span>
          </button>
        ) : null}
        <span className="ml-auto">{elapsed}</span>
      </div>
    </article>
      )}
    </ContextMenuTrigger>
  );
}

function GuideStepRow({ run }: { run: RunState }) {
  const guide = run.guide;
  if (!guide) return null;
  const current =
    guide.steps.find((step) => step.id === guide.currentStepId) ?? null;
  const done = guide.steps.filter(
    (step) => step.status === "passed" || step.status === "skipped",
  ).length;
  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5 rounded border border-amaco-accent/25 bg-amaco-accent/5 px-2 py-1 amaco-mono text-[10.5px]">
      <span className="shrink-0 text-amaco-accent">guide</span>
      <span className="truncate text-amaco-fg" title={guide.label}>
        {guide.label}
      </span>
      <span className="shrink-0 text-amaco-fg-muted">
        {done}/{guide.steps.length}
      </span>
      {current ? (
        <span
          className="truncate text-amaco-fg-dim"
          title={`${current.label} (${current.status})`}
        >
          {current.label} · {current.status}
        </span>
      ) : null}
      {guide.participants.length > 0 ? (
        <span
          className="shrink min-w-0 truncate text-amaco-fg-muted"
          title={guide.participants
            .map(
              (participant) =>
                `${participant.label}: ${participant.lastContextMode ?? participant.sessionReuse}`,
            )
            .join(", ")}
        >
          {guide.participants
            .map(
              (participant) =>
                `${participant.slotId}:${participant.lastContextMode ?? participant.sessionReuse}`,
            )
            .join(" ")}
        </span>
      ) : null}
    </div>
  );
}

function PhaseRailRow({ states }: { states: PhaseState[] }) {
  return (
    <ol
      role="list"
      aria-label="Workflow phases"
      className="mt-3 flex items-center gap-0.5"
    >
      {PHASES.map((p, i) => {
        const state = states[i] ?? "pending";
        return (
          <li
            key={p.key}
            className="flex flex-1 flex-col items-center gap-1"
            title={`${p.label}: ${state}`}
            aria-label={`${p.label}: ${state}`}
          >
            <PhaseDot state={state} />
            <span
              className={`amaco-mono truncate text-[9.5px] uppercase tracking-[0.08em] ${
                state === "active"
                  ? "text-amaco-accent"
                  : state === "done"
                    ? "text-amaco-success"
                    : state === "blocked"
                      ? "text-amaco-fail"
                      : state === "awaiting"
                        ? "text-amaco-warn"
                        : "text-amaco-fg-muted"
              }`}
            >
              {p.label.slice(0, 4)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PhaseDot({ state }: { state: PhaseState }) {
  if (state === "done") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amaco-success/20 text-amaco-success">
        <Check className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amaco-accent/25 text-amaco-accent">
        <span className="block h-2 w-2 animate-pulse rounded-full bg-amaco-accent" />
      </span>
    );
  }
  if (state === "awaiting") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amaco-warn/20 text-amaco-warn">
        <Pause className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amaco-fail/20 text-amaco-fail">
        <AlertCircle className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  return (
    <span className="inline-block h-2 w-2 rounded-full bg-amaco-border" aria-hidden />
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  const tone =
    status === "failed" || status === "aborted"
      ? "border-amaco-fail/40 bg-amaco-fail/10 text-amaco-fail"
      : status === "blocked"
        ? "border-amaco-fail/40 bg-amaco-fail/10 text-amaco-fail"
        : status === "waiting_for_approval"
          ? "border-amaco-warn/50 bg-amaco-warn/10 text-amaco-warn"
          : status === "paused"
            ? "border-amaco-warn/50 bg-amaco-warn/10 text-amaco-warn"
            : status === "merge_ready"
              ? "border-amaco-success/40 bg-amaco-success/10 text-amaco-success"
              : "border-amaco-accent/40 bg-amaco-accent/10 text-amaco-accent";
  return (
    <span
      className={`amaco-mono shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${tone}`}
      aria-label={`Run status: ${status}`}
    >
      {status}
    </span>
  );
}

function deriveLive(events: AmacoEvent[]): {
  currentAgent: string | null;
  currentProvider: string | null;
  currentSkills: string[];
  lastEvent: AmacoEvent | null;
} {
  let agent: string | null = null;
  let provider: string | null = null;
  let skills: string[] = [];
  let last: AmacoEvent | null = null;
  for (const ev of events) {
    last = ev;
    const agentId =
      ev.data && typeof ev.data.agentId === "string"
        ? (ev.data.agentId as string)
        : null;
    if (ev.type === "agent.started" && agentId) {
      agent = agentId;
      provider =
        ev.data && typeof ev.data.provider === "string"
          ? (ev.data.provider as string)
          : null;
      skills =
        ev.data && Array.isArray(ev.data.skillsAttached)
          ? (ev.data.skillsAttached as unknown[]).filter(
              (s): s is string => typeof s === "string",
            )
          : [];
    }
    if (
      (ev.type === "agent.completed" || ev.type === "agent.failed") &&
      agentId === agent
    ) {
      agent = null;
      provider = null;
      skills = [];
    }
  }
  return {
    currentAgent: agent,
    currentProvider: provider,
    currentSkills: skills,
    lastEvent: last,
  };
}

function describeWaiting(status: RunStatus, error: string | null): string | null {
  if (status === "waiting_for_approval")
    return "Waiting for human approval — open the run to approve or reject.";
  if (status === "paused")
    return "Paused — resume from the run detail page or CLI.";
  if (status === "blocked")
    return error
      ? `Blocked: ${truncate(error, 120)}`
      : "Blocked at preflight — open the run for details.";
  if (status === "failed")
    return error
      ? `Failed: ${truncate(error, 120)}`
      : "Failed — open the run for the error.";
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

function elapsedSince(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const ms = Math.max(0, Date.now() - t);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
