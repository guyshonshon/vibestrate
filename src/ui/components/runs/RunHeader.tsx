import { useState } from "react";
import { GitBranch, Folder, Clock, Pause, Play } from "lucide-react";
import type { RunState } from "../../lib/types.js";
import { api } from "../../lib/api.js";
import { RunStatusBadge } from "./RunStatusBadge.js";

const TERMINAL = new Set(["merge_ready", "blocked", "failed", "aborted"]);

export function RunHeader({
  run,
  onRunUpdated,
}: {
  run: RunState;
  /** Optional callback so the parent can refresh its in-memory state once
   * pause/resume completes server-side. The parent's own poll picks it up
   * anyway, but pushing the new state through avoids a flicker. */
  onRunUpdated?: (run: RunState) => void;
}) {
  const [busy, setBusy] = useState<"pause" | "resume" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = TERMINAL.has(run.status);
  const isPaused = run.status === "paused";
  const pausePending = !isPaused && run.pauseRequested === true;
  const canPause = !isTerminal && !isPaused && !pausePending;
  const canResume = isPaused || pausePending;

  async function doPause() {
    setBusy("pause");
    setError(null);
    try {
      const next = await api.pauseRun(run.runId);
      onRunUpdated?.(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function doResume() {
    setBusy("resume");
    setError(null);
    try {
      const next = await api.resumeRun(run.runId);
      onRunUpdated?.(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <header className="border-b border-amaco-border bg-amaco-panel px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            <span className="amaco-mono">{run.runId}</span>
          </div>
          <h1 className="mt-1 truncate text-[16px] font-medium text-amaco-fg">
            {run.task}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-amaco-fg-dim">
            <RunStatusBadge status={run.status} />
            {pausePending ? (
              <span
                className="amaco-mono rounded border border-amaco-accent/50 px-1.5 py-0.5 text-[10.5px] text-amaco-accent"
                title={`Pause requested while at ${run.status}; will take effect at the next stage boundary.`}
              >
                pause queued
              </span>
            ) : null}
            {run.finalDecision ? (
              <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
                {run.finalDecision}
              </span>
            ) : null}
            {run.verification ? (
              <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px]">
                {run.verification}
              </span>
            ) : null}
            {run.branchName ? (
              <span className="amaco-mono inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" strokeWidth={1.5} />
                {run.branchName}
              </span>
            ) : null}
            {run.worktreePath ? (
              <span className="amaco-mono inline-flex items-center gap-1 truncate">
                <Folder className="h-3 w-3" strokeWidth={1.5} />
                {run.worktreePath}
              </span>
            ) : null}
            <span className="amaco-mono inline-flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.5} />
              {new Date(run.updatedAt).toLocaleString()}
            </span>
          </div>
          {error ? (
            <div className="mt-2 rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-[11px] text-amaco-fail">
              {error}
            </div>
          ) : null}
        </div>
        {/* Pause / Resume controls. Disabled (not hidden) on terminal runs
         * so the surface stays predictable. Only one button is enabled at
         * a time — pause-pending shows Resume so the user can cancel. */}
        <div className="flex shrink-0 items-start gap-1.5">
          {canResume ? (
            <button
              type="button"
              onClick={doResume}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[11.5px] text-amaco-fg-dim hover:bg-amaco-panel disabled:opacity-50"
              title={
                isPaused
                  ? "Resume the paused run"
                  : "Cancel the pending pause request"
              }
            >
              <Play className="h-3 w-3" strokeWidth={1.5} />
              {busy === "resume" ? "Resuming…" : isPaused ? "Resume" : "Cancel pause"}
            </button>
          ) : canPause ? (
            <button
              type="button"
              onClick={doPause}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[11.5px] text-amaco-fg-dim hover:bg-amaco-panel disabled:opacity-50"
              title="Request pause at the next stage boundary"
            >
              <Pause className="h-3 w-3" strokeWidth={1.5} />
              {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
