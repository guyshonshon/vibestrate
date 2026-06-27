import { useState } from "react";
import { Pause, Play, StopCircle } from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunState, RunStatus } from "../../lib/types.js";

const TERMINAL = new Set<RunStatus>([
  "merge_ready",
  "blocked",
  "failed",
  "aborted",
]);

// Inline pause / resume / abort controls that own their own busy + error state,
// so feedback stays on the surface that fired the action (a run card, the
// composer's launch panel) instead of a page-level toast. Reuses the same
// pause/resume gating as the run-detail header. Renders nothing for terminal
// runs. Place inside a `flex flex-wrap items-center gap-2` row - the inline
// error wraps to its own line.
export function RunActions({
  runId,
  status,
  pauseRequested,
  onUpdated,
}: {
  runId: string;
  status: RunStatus;
  pauseRequested?: boolean;
  /** Push the new run state up so the caller can update without waiting for
   * its next poll. The caller's own poll picks it up anyway. */
  onUpdated?: (run: RunState) => void;
}) {
  const [busy, setBusy] = useState<"pause" | "resume" | "abort" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "paused";
  const pausePending = !isPaused && pauseRequested === true;
  const canPause = !isPaused && !pausePending;
  const canResume = isPaused || pausePending;

  if (TERMINAL.has(status)) return null;

  const run = async (
    kind: "pause" | "resume" | "abort",
    call: (id: string) => Promise<RunState>,
  ) => {
    setBusy(kind);
    setError(null);
    try {
      const next = await call(runId);
      onUpdated?.(next);
      // Nudge any list view watching for changes (Mission Control's Active
      // panel) so the card reflects the new status promptly.
      window.dispatchEvent(new Event("vibestrate:runs-refresh"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      {canResume ? (
        <button
          type="button"
          onClick={() => void run("resume", (id) => api.resumeRun(id))}
          disabled={busy !== null}
          className={`${btn} text-violet-soft hover:bg-violet-soft/10`}
          title={isPaused ? "Resume the paused run" : "Cancel the pending pause request"}
        >
          <Play className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
          {busy === "resume" ? "Resuming…" : isPaused ? "Resume" : "Cancel pause"}
        </button>
      ) : canPause ? (
        <button
          type="button"
          onClick={() => void run("pause", (id) => api.pauseRun(id))}
          disabled={busy !== null}
          className={`${btn} text-amber-soft hover:bg-amber-soft/10`}
          title="Request pause at the next stage boundary"
        >
          <Pause className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
          {busy === "pause" ? "Pausing…" : "Pause"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void run("abort", (id) => api.abortRun(id))}
        disabled={busy !== null}
        className={`${btn} text-rose-300 hover:bg-rose-500/10`}
        title="Abort the run: kill the in-flight provider CLI and mark the run aborted."
      >
        <StopCircle className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
        {busy === "abort" ? "Aborting…" : "Abort"}
      </button>
      {error ? (
        <div className="w-full rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300">
          {error}
        </div>
      ) : null}
    </>
  );
}
