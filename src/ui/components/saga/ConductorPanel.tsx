import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { SagaStatus, EngagementEntry } from "../../lib/types.js";
import { Button } from "../design/Button.js";
import { StatTile } from "../design/StatTile.js";
import { cn } from "../design/cn.js";

// The live Saga CONDUCTOR view (Phase 2b part 2). A self-contained MC-idiom card
// that polls GET /api/sagas/:taskId/status (~2s) for a saga's lifecycle, step
// progress, the non-folding invariants ledger, and any clean halt - plus the
// LIVE run's supervisor decisions (the saga.* engagement moments). Pause/Resume
// drive the live run through the existing run routes. Read-only otherwise; the
// dashboard launch ("Sequence") follows once the saga launch path is threaded
// through the scheduler.

const STATE_TONE: Record<SagaStatus["sagaState"], string> = {
  idle: "text-chalk-300",
  sequencing: "text-violet-soft",
  paused: "text-amber-soft",
  halted: "text-rose-300",
  done: "text-emerald-400",
};

const ENG_TONE: Record<EngagementEntry["tone"], string> = {
  ok: "text-emerald-400",
  warn: "text-amber-soft",
  bad: "text-rose-300",
  info: "text-chalk-300",
};

const STEP_GLYPH: Record<string, string> = {
  done: "✓",
  in_progress: "▸",
  blocked: "!",
  pending: "·",
};

function stepTone(status: string): string {
  return status === "done"
    ? "text-emerald-400"
    : status === "in_progress"
      ? "text-violet-soft"
      : status === "blocked"
        ? "text-rose-300"
        : "text-chalk-400";
}

export function ConductorPanel({ taskId }: { taskId: string }) {
  const [status, setStatus] = useState<SagaStatus | null>(null);
  const [engagement, setEngagement] = useState<EngagementEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.getSagaStatus(taskId);
      setStatus(res.status);
      setErr(null);
      if (res.status.liveRunId) {
        const eng = await api.getRunEngagement(res.status.liveRunId).catch(() => []);
        // Only the conductor's own moments (supervisor verdicts, clean halts).
        setEngagement(eng.filter((e) => e.type.startsWith("saga.")));
      } else {
        setEngagement([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function control(kind: "pause" | "resume") {
    if (!status?.liveRunId) return;
    setBusy(kind);
    try {
      if (kind === "pause") await api.pauseRun(status.liveRunId);
      else await api.resumeRun(status.liveRunId);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;

  const live = status.liveRunId !== null;
  const { done, total } = status.progress;

  return (
    <section className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-chalk-100">Conductor</h3>
          <span
            className={cn(
              "num-tabular text-[12px] font-medium",
              STATE_TONE[status.sagaState] ?? "text-chalk-300",
            )}
          >
            {status.sagaState}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={!live || busy !== null}
            onClick={() => control("pause")}
          >
            Pause
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!live || busy !== null}
            onClick={() => control("resume")}
          >
            Resume
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatTile
          value={`${done}/${total}`}
          label="steps done"
          tone={total > 0 && done === total ? "emerald" : "default"}
        />
        <StatTile
          value={status.sagaInvariants.length}
          label="invariants"
          tone={status.sagaInvariants.length ? "violet" : "default"}
        />
        {live ? <StatTile value="running" label="live run" tone="violet" /> : null}
      </div>

      {status.sagaHalt ? (
        <div className="mt-3 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-3 py-2.5">
          <div className="text-[12.5px] font-semibold text-rose-300">
            Halted · {status.sagaHalt.reason}
          </div>
          {status.sagaHalt.summary ? (
            <div className="mt-1 text-[12px] leading-relaxed text-chalk-300">
              {status.sagaHalt.summary}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-0.5">
        {status.steps.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "flex items-start gap-2 rounded-[10px] px-2 py-1.5",
              s.status === "in_progress" && "bg-coal-500/60",
            )}
          >
            <span className={cn("mt-[1px] w-4 shrink-0 text-center num-tabular text-[12px]", stepTone(s.status))}>
              {STEP_GLYPH[s.status] ?? "·"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] text-chalk-100">
                {i + 1}. {s.text}
              </div>
              {s.outcomeSummary ? (
                <div className="mt-0.5 line-clamp-2 text-[11.5px] text-chalk-300">
                  {s.outcomeSummary}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {engagement.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[11px] text-chalk-300">supervisor</div>
          <div className="flex flex-col gap-1">
            {engagement.slice(-6).map((e) => (
              <div key={e.seq} className="flex items-baseline gap-2 text-[12px]">
                <span className={cn("font-medium", ENG_TONE[e.tone] ?? "text-chalk-300")}>
                  {e.title}
                </span>
                {e.detail ? <span className="text-chalk-400">{e.detail}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {status.sagaInvariants.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[11px] text-chalk-300">invariants ledger</div>
          <ul className="flex flex-col gap-1">
            {status.sagaInvariants.map((inv, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-chalk-100">
                <span className="shrink-0 text-violet-soft">-</span>
                <span className="min-w-0">{inv}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {err ? <div className="mt-3 text-[12px] text-rose-300">{err}</div> : null}
    </section>
  );
}
