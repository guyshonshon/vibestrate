import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { RunState, RunStatus, Task } from "../../lib/types.js";

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

export function MissionControlPage({
  onSelectRun,
  onShowRoadmap,
  onShowQueue,
}: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [r, t] = await Promise.all([api.listRuns(), api.listTasks()]);
        setRuns(r);
        setTasks(t);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(id);
  }, []);

  const active = runs.filter((r) => isActive(r.status));
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
          <div className="text-[11.5px] text-amaco-fg-muted">
            real-time view of every active run · refreshes every 2s
          </div>
        </div>

        {/* Stat strip */}
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
          <div className="rounded border border-amaco-fail/30 bg-amaco-fail/5 px-3 py-2 text-[12.5px] text-amaco-fail">
            {error}
          </div>
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
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {active.map((r) => (
                <RunCard
                  key={r.runId}
                  run={r}
                  onClick={() => onSelectRun(r.runId)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RunCard({ run, onClick }: { run: RunState; onClick: () => void }) {
  const tone =
    STATUS_TONE[run.status] ?? "bg-amaco-panel-2 text-amaco-fg-muted border-amaco-border";
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 rounded border border-amaco-border bg-amaco-panel p-3 text-left transition-colors hover:border-amaco-accent/40 hover:bg-amaco-panel-2"
    >
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
      <div className="text-[12.5px] font-medium text-amaco-fg">
        {run.task.length > 80 ? `${run.task.slice(0, 79)}…` : run.task}
      </div>
      <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
        {run.runId}
        {run.effort ? <span> · {run.effort}</span> : null}
        {run.readOnly ? <span className="text-amaco-warn"> · read-only</span> : null}
      </div>
    </button>
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
