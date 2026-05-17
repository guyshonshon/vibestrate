import { useState } from "react";
import {
  Cpu,
  Eye,
  Clock,
  Pause,
  Play,
  RotateCcw,
  Zap,
} from "lucide-react";
import type { RunState } from "../../lib/types.js";
import { api } from "../../lib/api.js";
import { RunStatusBadge } from "./RunStatusBadge.js";
import { RunWorktreeBlock } from "./RunWorktreeBlock.js";

const TERMINAL = new Set(["merge_ready", "blocked", "failed", "aborted"]);

export function RunHeader({
  run,
  onRunUpdated,
  onOpenCodebase,
  onOpenGit,
  onOpenTask,
}: {
  run: RunState;
  /** Optional callback so the parent can refresh its in-memory state once
   * pause/resume completes server-side. The parent's own poll picks it up
   * anyway, but pushing the new state through avoids a flicker. */
  onRunUpdated?: (run: RunState) => void;
  /** Navigation handlers for the consolidated worktree row. */
  onOpenCodebase?: () => void;
  onOpenGit?: () => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const [busy, setBusy] = useState<"pause" | "resume" | "retry" | null>(null);
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
  async function doRetry() {
    setBusy("retry");
    setError(null);
    try {
      const r = await api.retryRun(run.runId);
      // Don't reload run state — the original record stays where it
      // is; the retry got a fresh runId. Just flash a confirmation.
      setError(
        `Spawned retry: ${r.message}${r.pid !== null ? ` (pid ${r.pid})` : ""}`,
      );
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
            {run.readOnly ? (
              <span
                className="inline-flex items-center gap-1 rounded border border-amaco-warn/60 bg-amaco-warn/15 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-amaco-warn"
                title="Investigation-only run: executor and fix loop are skipped, apply/validate/revert are refused, every agent runs with the readOnly permission profile."
              >
                <Eye className="h-3 w-3" strokeWidth={1.5} />
                read-only
              </span>
            ) : null}
            {run.effort ? (
              <span
                className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10.5px] text-amaco-fg-muted"
                title={`Task effort: ${run.effort}. Maps to a provider via project.yml#effortMap.`}
              >
                <Zap className="h-3 w-3" strokeWidth={1.5} />
                effort {run.effort}
              </span>
            ) : null}
            {run.resolvedProviderId ? (
              <span
                className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-accent/40 px-1.5 py-0.5 text-[10.5px] text-amaco-accent"
                title={`Run-wide provider override: every agent uses "${run.resolvedProviderId}" instead of its configured provider.`}
              >
                <Cpu className="h-3 w-3" strokeWidth={1.5} />
                {run.resolvedProviderId}
              </span>
            ) : null}
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
        {/* Run-action toolbar. Promoted from the previous dim text-only
         * row to full-size accent / warn-toned buttons so Pause / Resume
         * / Retry don't get lost in the corner. */}
        <div className="flex shrink-0 items-start gap-2">
          {canResume ? (
            <button
              type="button"
              onClick={doResume}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-amaco-accent/50 bg-amaco-accent/10 px-3 py-1.5 text-[12.5px] font-medium text-amaco-accent hover:bg-amaco-accent/20 focus:outline-none focus:ring-1 focus:ring-amaco-accent disabled:opacity-50"
              title={
                isPaused
                  ? "Resume the paused run"
                  : "Cancel the pending pause request"
              }
            >
              <Play className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              {busy === "resume" ? "Resuming…" : isPaused ? "Resume" : "Cancel pause"}
            </button>
          ) : canPause ? (
            <button
              type="button"
              onClick={doPause}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-amaco-warn/50 bg-amaco-warn/10 px-3 py-1.5 text-[12.5px] font-medium text-amaco-warn hover:bg-amaco-warn/20 focus:outline-none focus:ring-1 focus:ring-amaco-warn disabled:opacity-50"
              title="Request pause at the next stage boundary"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          ) : null}
          {isTerminal ? (
            <button
              type="button"
              onClick={doRetry}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-amaco-accent/50 bg-amaco-accent/10 px-3 py-1.5 text-[12.5px] font-medium text-amaco-accent hover:bg-amaco-accent/20 focus:outline-none focus:ring-1 focus:ring-amaco-accent disabled:opacity-50"
              title="Re-run this task with the same flags. The current run record stays on disk; the retry gets a fresh runId."
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              {busy === "retry" ? "Retrying…" : "Retry"}
            </button>
          ) : null}
        </div>
      </div>
      {/* Consolidated worktree / git context — merged into the header
       * so it doesn't repeat as a separate block below. */}
      {run.worktreePath ? (
        <div className="mt-3">
          <RunWorktreeBlock
            runId={run.runId}
            worktreePath={run.worktreePath}
            branchName={run.branchName}
            taskId={run.taskId ?? null}
            onOpenCodebase={onOpenCodebase ?? (() => {})}
            onOpenGit={onOpenGit ?? (() => {})}
            onOpenTask={onOpenTask ?? (() => {})}
          />
        </div>
      ) : null}
    </header>
  );
}
