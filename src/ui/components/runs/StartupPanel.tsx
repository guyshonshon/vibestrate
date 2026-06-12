import { useEffect, useState } from "react";
import { Check, CircleDashed, Loader2, Minus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import {
  deriveStartupProgress,
  type StartupProgress,
  type StartupStageStatus,
} from "../../lib/run-startup.js";

// ── Staged startup checklist (T7) ────────────────────────────────────────────
// Between "run created" and the first agent turn the orchestrator creates the
// worktree, links the environment, materializes context, and spawns the
// provider. This renders those `run.startup` events as a live checklist so a
// just-started run shows progress instead of a blank screen - and surfaces the
// failed stage with its error when startup blows up.

function StageIcon({ status }: { status: StartupStageStatus }) {
  switch (status) {
    case "done":
      return <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />;
    case "active":
      return (
        <Loader2 className="h-3.5 w-3.5 text-violet-soft animate-spin" strokeWidth={2} />
      );
    case "skipped":
      return <Minus className="h-3.5 w-3.5 text-fog-500" strokeWidth={2} />;
    case "failed":
      return <X className="h-3.5 w-3.5 text-rose-400" strokeWidth={2} />;
    default:
      return <CircleDashed className="h-3.5 w-3.5 text-fog-600" strokeWidth={1.7} />;
  }
}

export function StartupPanel({
  runId,
  status,
}: {
  runId: string;
  /** The run's status - we stop polling once it's clearly past startup. */
  status: string;
}) {
  const [progress, setProgress] = useState<StartupProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const events = await api.listEvents(runId);
        if (!cancelled) setProgress(deriveStartupProgress(events));
      } catch {
        /* best-effort; the panel just won't show */
      }
    };
    void load();
    // Startup is seconds-long; poll briefly while it's in flight.
    const interval = setInterval(load, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId]);

  if (!progress) return null;
  // Once the provider stage is reached (and the run is doing real work), the
  // live timeline takes over - unless startup failed, which we keep visible.
  if (progress.complete && !progress.failedStage && status !== "created") {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.12em] opacity-60 mb-2">
        {progress.failedStage ? "Startup failed" : "Starting up"}
      </div>
      <ol className="space-y-1.5">
        {progress.stages.map((s) => (
          <li key={s.stage} className="flex items-center gap-2 text-[12.5px]">
            <span className="shrink-0">
              <StageIcon status={s.status} />
            </span>
            <span
              className={
                s.status === "failed"
                  ? "text-rose-300"
                  : s.status === "active"
                    ? "text-fog-100"
                    : s.status === "pending"
                      ? "text-fog-500"
                      : "text-fog-300"
              }
            >
              {s.label}
            </span>
            {s.detail ? (
              <span className="text-[11px] text-fog-500 truncate">{s.detail}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
