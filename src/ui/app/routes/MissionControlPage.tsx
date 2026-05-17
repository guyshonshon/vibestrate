import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type {
  AmacoEvent,
  RunState,
  RunStatus,
  Task,
} from "../../lib/types.js";

type Props = {
  onSelectRun: (runId: string) => void;
  onShowRoadmap: () => void;
  onShowQueue: () => void;
};

const STATUS_TONE: Record<string, string> = {
  planning: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  architecting: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  executing:
    "bg-amaco-accent/10 text-amaco-accent border-amaco-accent/30",
  validating: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  reviewing: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  fixing: "bg-amaco-accent/10 text-amaco-accent border-amaco-accent/30",
  verifying: "bg-amaco-info/10 text-amaco-info border-amaco-info/30",
  paused: "bg-amaco-warn/10 text-amaco-warn border-amaco-warn/30",
  waiting_for_approval:
    "bg-amaco-warn/10 text-amaco-warn border-amaco-warn/30",
  merge_ready:
    "bg-amaco-success/10 text-amaco-success border-amaco-success/30",
  blocked: "bg-amaco-fail/10 text-amaco-fail border-amaco-fail/30",
  failed: "bg-amaco-fail/10 text-amaco-fail border-amaco-fail/30",
  aborted: "bg-amaco-fail/10 text-amaco-fail border-amaco-fail/30",
};

/** Canonical workflow phases the orchestrator walks through. */
const WORKFLOW_STEPS = [
  { key: "plan", label: "Plan", statuses: ["planning", "planned"] },
  { key: "arch", label: "Arch", statuses: ["architecting", "architected"] },
  { key: "exec", label: "Exec", statuses: ["executing"] },
  { key: "val", label: "Val", statuses: ["validating"] },
  { key: "review", label: "Review", statuses: ["reviewing"] },
  { key: "fix", label: "Fix", statuses: ["fixing"] },
  { key: "verify", label: "Verify", statuses: ["verifying"] },
  { key: "ready", label: "Ready", statuses: ["merge_ready"] },
] as const;

function isActive(s: RunStatus): boolean {
  return ![
    "merge_ready",
    "failed",
    "aborted",
    "blocked",
  ].includes(s);
}

function relTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = Math.max(0, now - t);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Compute a step-index for the current status. Steps the run has
 * already passed render as "done" (green tick); the current step is
 * pulsing cyan; later steps are dim.
 */
function currentStepIndex(status: RunStatus): number {
  for (let i = 0; i < WORKFLOW_STEPS.length; i += 1) {
    const step = WORKFLOW_STEPS[i]!;
    if (step.statuses.some((s) => s === status)) return i;
  }
  // Terminal / off-path statuses (paused, approval, blocked, failed,
  // aborted) — mark the last reached step by the run state's
  // pausedAtStatus when available, otherwise leave as -1 ("unknown").
  if (status === "paused" || status === "waiting_for_approval") return -1;
  return -1;
}

/**
 * Walk an events tail to derive what's *currently* attached: the
 * agent the orchestrator most recently started without a matching
 * completed / failed, plus its provider and MCP servers.
 */
function deriveLive(events: AmacoEvent[]): {
  currentAgent: string | null;
  currentProvider: string | null;
  currentMcp: string[];
  lastEvent: AmacoEvent | null;
} {
  let agent: string | null = null;
  let provider: string | null = null;
  let mcp: string[] = [];
  for (const ev of events) {
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
      mcp = [];
    } else if (
      (ev.type === "agent.completed" || ev.type === "agent.failed") &&
      agentId === agent
    ) {
      agent = null;
      provider = null;
      mcp = [];
    } else if (
      ev.type === "mcp.attached" &&
      agentId === agent &&
      Array.isArray(ev.data?.servers)
    ) {
      const servers = ev.data!.servers as Array<{ name?: unknown }>;
      mcp = servers
        .map((s) => (typeof s.name === "string" ? s.name : null))
        .filter((n): n is string => !!n);
    }
  }
  return {
    currentAgent: agent,
    currentProvider: provider,
    currentMcp: mcp,
    lastEvent: events.length > 0 ? events[events.length - 1] ?? null : null,
  };
}

export function MissionControlPage({
  onSelectRun,
  onShowRoadmap,
  onShowQueue,
}: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, AmacoEvent[]>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTask, setComposerTask] = useState("");
  const [composerEffort, setComposerEffort] = useState<"" | "low" | "medium" | "high">("");
  const [composerReadOnly, setComposerReadOnly] = useState(false);
  const [composerBusy, setComposerBusy] = useState(false);

  // Auto-dismiss the toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const [r, t] = await Promise.all([api.listRuns(), api.listTasks()]);
        if (cancelled) return;
        setRuns(r);
        setTasks(t);
        setError(null);
        // Best-effort: read the recent events for each *active* run so
        // the inline panel can show the current agent / MCP / phase.
        // We do this on the same poll tick to keep complexity low.
        const active = r.filter((x) => isActive(x.status));
        const byRun: Record<string, AmacoEvent[]> = {};
        await Promise.all(
          active.map(async (a) => {
            try {
              const evs = await api.listEvents(a.runId);
              byRun[a.runId] = evs.slice(-50);
            } catch {
              byRun[a.runId] = [];
            }
          }),
        );
        if (!cancelled) setEventsByRun(byRun);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const active = runs.filter((r) => isActive(r.status));

  const handleAction = async (
    kind: "pause" | "resume" | "abort",
    runId: string,
  ): Promise<void> => {
    try {
      if (kind === "pause") await api.pauseRun(runId);
      else if (kind === "resume") await api.resumeRun(runId);
      else await api.abortRun(runId);
      setToast({ kind: "ok", text: `${kind} requested for ${runId}` });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSpawn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const task = composerTask.trim();
    if (!task) return;
    setComposerBusy(true);
    try {
      const r = await api.spawnRun({
        task,
        effort: composerEffort || undefined,
        readOnly: composerReadOnly || undefined,
      });
      setToast({ kind: "ok", text: r.message });
      setComposerTask("");
      setComposerEffort("");
      setComposerReadOnly(false);
      setComposerOpen(false);
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setComposerBusy(false);
    }
  };
  const queuedTaskCount = tasks.filter((t) => t.status === "queued").length;
  const blockedTaskCount = tasks.filter((t) => t.status === "blocked").length;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              mission control
            </div>
            <h1 className="mt-1 text-[18px] font-medium">Live orchestrator</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-amaco-fg-muted">refreshes every 2s</span>
            <button
              onClick={() => setComposerOpen((v) => !v)}
              className="rounded border border-amaco-accent/40 bg-amaco-accent/10 px-3 py-1.5 text-[12.5px] font-medium text-amaco-accent hover:bg-amaco-accent/20"
            >
              {composerOpen ? "Close" : "+ Run a task"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-stretch gap-2">
          <Stat label="active runs" value={String(active.length)} accent />
          <Stat label="total runs" value={String(runs.length)} />
          <Stat
            label="tasks"
            value={String(tasks.length)}
            hint="open backlog + queue"
          />
          <Stat
            label="queued"
            value={String(queuedTaskCount)}
            tint={queuedTaskCount > 0 ? "warn" : undefined}
          />
          <Stat
            label="blocked"
            value={String(blockedTaskCount)}
            tint={blockedTaskCount > 0 ? "fail" : undefined}
          />
        </div>
      </header>

      <div className="flex-1 px-6 py-4">
        {error ? (
          <div className="mb-3 rounded border border-amaco-fail/30 bg-amaco-fail/5 px-3 py-2 text-[12.5px] text-amaco-fail">
            {error}
          </div>
        ) : null}

        {toast ? (
          <div
            className={`mb-3 rounded border px-3 py-2 text-[12.5px] ${
              toast.kind === "ok"
                ? "border-amaco-success/40 bg-amaco-success/5 text-amaco-success"
                : "border-amaco-fail/30 bg-amaco-fail/5 text-amaco-fail"
            }`}
          >
            {toast.kind === "ok" ? "✓ " : "✗ "}
            {toast.text}
          </div>
        ) : null}

        {composerOpen ? (
          <form
            onSubmit={handleSpawn}
            className="mb-4 flex flex-col gap-2 rounded border border-amaco-accent/40 bg-amaco-panel-2/60 p-3"
          >
            <label className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              new run
            </label>
            <input
              autoFocus
              type="text"
              value={composerTask}
              onChange={(e) => setComposerTask(e.target.value)}
              placeholder='describe the change — e.g. "add health check endpoint"'
              className="rounded border border-amaco-border bg-amaco-panel px-2 py-1.5 text-[12.5px] text-amaco-fg outline-none focus:border-amaco-accent"
            />
            <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
              <label className="flex items-center gap-1.5 text-amaco-fg-muted">
                effort
                <select
                  value={composerEffort}
                  onChange={(e) =>
                    setComposerEffort(
                      e.target.value as "" | "low" | "medium" | "high",
                    )
                  }
                  className="rounded border border-amaco-border bg-amaco-panel px-1.5 py-0.5 text-amaco-fg outline-none focus:border-amaco-accent"
                >
                  <option value="">auto</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-amaco-fg-muted">
                <input
                  type="checkbox"
                  checked={composerReadOnly}
                  onChange={(e) => setComposerReadOnly(e.target.checked)}
                />
                read-only
              </label>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="rounded border border-amaco-border bg-amaco-panel px-2 py-1 text-amaco-fg-dim hover:text-amaco-fg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={composerBusy || composerTask.trim().length === 0}
                  className="rounded border border-amaco-accent/40 bg-amaco-accent/10 px-3 py-1 font-medium text-amaco-accent hover:bg-amaco-accent/20 disabled:opacity-50"
                >
                  {composerBusy ? "Spawning…" : "Spawn amaco run"}
                </button>
              </div>
            </div>
            <div className="text-[10.5px] text-amaco-fg-muted">
              Runs server-side via{" "}
              <code className="amaco-mono">amaco run</code>; detached so the
              dashboard stays responsive. The new run appears below within ~2s.
            </div>
          </form>
        ) : null}

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              active runs ({active.length})
            </h2>
            <div className="flex gap-2 text-[11.5px]">
              <button
                onClick={onShowRoadmap}
                className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
              >
                Roadmap →
              </button>
              <button
                onClick={onShowQueue}
                className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
              >
                Queue →
              </button>
            </div>
          </div>
          {active.length === 0 ? (
            <div className="mt-3 rounded border border-dashed border-amaco-border bg-amaco-panel/40 px-4 py-6 text-center text-[12.5px] text-amaco-fg-muted">
              no active runs · start one with{" "}
              <code className="amaco-mono rounded bg-amaco-panel-2 px-1 py-0.5">
                amaco run "describe the change"
              </code>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {active.map((r) => (
                <RunCard
                  key={r.runId}
                  run={r}
                  events={eventsByRun[r.runId] ?? []}
                  onOpen={() => onSelectRun(r.runId)}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RunCard({
  run,
  events,
  onOpen,
  onAction,
}: {
  run: RunState;
  events: AmacoEvent[];
  onOpen: () => void;
  onAction: (kind: "pause" | "resume" | "abort", runId: string) => Promise<void>;
}) {
  const tone =
    STATUS_TONE[run.status] ??
    "bg-amaco-panel-2 text-amaco-fg-muted border-amaco-border";
  const stepIdx = currentStepIndex(run.status);
  const live = deriveLive(events);
  const canPause =
    run.status !== "paused" &&
    run.status !== "merge_ready" &&
    run.status !== "failed" &&
    run.status !== "aborted" &&
    run.status !== "blocked" &&
    !run.pauseRequested;
  const canResume = run.status === "paused" || run.pauseRequested;
  const canAbort =
    run.status !== "merge_ready" &&
    run.status !== "failed" &&
    run.status !== "aborted";
  return (
    <div className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3 transition-colors hover:border-amaco-accent/40 hover:bg-amaco-panel-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`amaco-mono rounded border px-1.5 py-0.5 text-[10.5px] ${tone}`}
        >
          {run.status}
        </span>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          {relTime(run.updatedAt)}
        </span>
      </div>
      <button
        onClick={onOpen}
        className="text-left text-[12.5px] font-medium text-amaco-fg hover:text-amaco-accent"
      >
        {run.task.length > 80 ? `${run.task.slice(0, 79)}…` : run.task}
      </button>
      <Stepper stepIdx={stepIdx} />
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10.5px]">
        {live.currentAgent ? (
          <span>
            <span className="text-amaco-fg-muted">agent </span>
            <span className="text-amaco-accent">{live.currentAgent}</span>
          </span>
        ) : (
          <span className="text-amaco-fg-muted">no active agent</span>
        )}
        {live.currentProvider ? (
          <span className="text-amaco-fg-muted">
            via <span className="text-amaco-fg">{live.currentProvider}</span>
          </span>
        ) : null}
        {live.currentMcp.length > 0 ? (
          <span>
            <span className="text-amaco-fg-muted">mcp </span>
            <span className="text-amaco-fg">{live.currentMcp.join(", ")}</span>
          </span>
        ) : null}
      </div>
      <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
        {run.runId}
        {run.effort ? <span> · {run.effort}</span> : null}
        {run.readOnly ? (
          <span className="text-amaco-warn"> · read-only</span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1.5 border-t border-amaco-border/60 pt-2">
        <ActionBtn
          label="Pause"
          tone="warn"
          disabled={!canPause}
          onClick={() => void onAction("pause", run.runId)}
        />
        <ActionBtn
          label="Resume"
          tone="info"
          disabled={!canResume}
          onClick={() => void onAction("resume", run.runId)}
        />
        <ActionBtn
          label="Abort"
          tone="fail"
          disabled={!canAbort}
          onClick={() => {
            if (
              window.confirm(`Abort run ${run.runId}?\n\nThis cannot be undone.`)
            ) {
              void onAction("abort", run.runId);
            }
          }}
        />
        <div className="ml-auto">
          <button
            onClick={onOpen}
            className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-2 py-0.5 text-[10.5px] text-amaco-fg-dim hover:bg-amaco-panel hover:text-amaco-fg"
          >
            Open →
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "warn" | "info" | "fail";
  disabled: boolean;
  onClick: () => void;
}) {
  const toneClasses =
    tone === "warn"
      ? "border-amaco-warn/30 text-amaco-warn hover:bg-amaco-warn/10"
      : tone === "info"
        ? "border-amaco-info/30 text-amaco-info hover:bg-amaco-info/10"
        : "border-amaco-fail/30 text-amaco-fail hover:bg-amaco-fail/10";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`amaco-mono rounded border bg-amaco-panel-2 px-2 py-0.5 text-[10.5px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${toneClasses}`}
    >
      {label}
    </button>
  );
}

function Stepper({ stepIdx }: { stepIdx: number }) {
  return (
    <div className="flex items-center gap-1">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = stepIdx > i;
        const current = stepIdx === i;
        return (
          <div key={step.key} className="flex flex-1 items-center gap-1">
            <span
              className={`h-1.5 flex-1 rounded ${
                done
                  ? "bg-amaco-success/60"
                  : current
                    ? "bg-amaco-accent"
                    : "bg-amaco-panel-2"
              }`}
            />
            <span
              className={`amaco-mono text-[9px] uppercase tracking-wider ${
                done
                  ? "text-amaco-success/80"
                  : current
                    ? "text-amaco-accent"
                    : "text-amaco-fg-muted"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tint?: "warn" | "fail";
  accent?: boolean;
}) {
  const valueColor =
    tint === "warn"
      ? "text-amaco-warn"
      : tint === "fail"
        ? "text-amaco-fail"
        : accent
          ? "text-amaco-accent"
          : "text-amaco-fg";
  return (
    <div className="flex flex-col rounded border border-amaco-border bg-amaco-panel-2 px-3 py-1.5 min-w-[110px]">
      <span className="text-[10.5px] text-amaco-fg-muted">{label}</span>
      <span className={`text-[16px] font-semibold ${valueColor}`}>{value}</span>
      {hint ? (
        <span className="text-[10.5px] text-amaco-fg-muted">{hint}</span>
      ) : null}
    </div>
  );
}
