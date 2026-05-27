import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Eye,
  Pause,
  Play,
  RotateCcw,
  StopCircle,
  Zap,
} from "lucide-react";
import type { RunState } from "../../lib/types.js";
import { api } from "../../lib/api.js";
import { RunStatusBadge } from "./RunStatusBadge.js";
import { RunWorktreeBlock } from "./RunWorktreeBlock.js";
import { usePersistedState } from "../../lib/usePersistedState.js";

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
  const [busy, setBusy] = useState<
    "pause" | "resume" | "retry" | "abort" | null
  >(null);
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
  async function doAbort() {
    if (
      !window.confirm(
        "Abort this run? The orchestrator will kill the provider CLI subprocess and stop at the next safe point.",
      )
    )
      return;
    setBusy("abort");
    setError(null);
    try {
      const next = await api.abortRun(run.runId);
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

  const [wtOpen, setWtOpen] = usePersistedState<boolean>(
    "amaco.run.worktree.open",
    false,
  );
  return (
    <header className="border-b border-amaco-border bg-amaco-panel px-6 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Title row: status pill + task title + run id stay on one
           * line. Subtle chips (read-only, effort, provider override)
           * trail on the right of the title row so they don't push
           * the task down. Updated-at moved into the worktree block. */}
          <div className="flex items-center gap-2">
            <RunStatusBadge status={run.status} />
            <h1
              className="truncate text-[14px] font-medium text-amaco-fg"
              title={run.task}
            >
              {run.task}
            </h1>
            <span
              className="amaco-mono shrink-0 text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted"
              title={`Run id · updated ${new Date(run.updatedAt).toLocaleString()}`}
            >
              {run.runId}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {run.readOnly ? (
                <span
                  className="inline-flex items-center gap-1 rounded border border-amaco-warn/60 bg-amaco-warn/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-amaco-warn"
                  title="Investigation-only run."
                >
                  <Eye className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                  read-only
                </span>
              ) : null}
              {run.effort ? (
                <span
                  className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-border px-1.5 py-0.5 text-[10px] text-amaco-fg-muted"
                  title={`Task effort: ${run.effort}.`}
                >
                  <Zap className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                  {run.effort}
                </span>
              ) : null}
              {run.resolvedProviderId ? (
                <span
                  className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-accent/40 px-1.5 py-0.5 text-[10px] text-amaco-accent"
                  title={`Run-wide provider override: ${run.resolvedProviderId}.`}
                >
                  <Cpu className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                  {run.resolvedProviderId}
                </span>
              ) : null}
              {pausePending ? (
                <span
                  className="amaco-mono rounded border border-amaco-warn/50 bg-amaco-warn/10 px-1.5 py-0.5 text-[10px] text-amaco-warn"
                  title={`Pause queued; takes effect at the next stage boundary.`}
                >
                  pause queued
                </span>
              ) : null}
              {run.finalDecision ? (
                <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10px] text-amaco-fg-dim">
                  {run.finalDecision}
                </span>
              ) : null}
              {run.verification ? (
                <span className="amaco-mono rounded border border-amaco-border px-1.5 py-0.5 text-[10px] text-amaco-fg-dim">
                  {run.verification}
                </span>
              ) : null}
            </div>
          </div>
          {error ? (
            <div className="mt-1.5 rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-[11px] text-amaco-fail">
              {error}
            </div>
          ) : null}
          {run.flow ? <FlowRunProgress run={run} /> : null}
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
          {/* Abort is a separate action from Pause: it kills the
           * provider CLI subprocess and transitions the run to
           * "aborted". Always available on non-terminal runs. */}
          {!isTerminal ? (
            <button
              type="button"
              onClick={doAbort}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-amaco-fail/50 bg-amaco-fail/10 px-3 py-1.5 text-[12.5px] font-medium text-amaco-fail hover:bg-amaco-fail/20 focus:outline-none focus:ring-1 focus:ring-amaco-fail disabled:opacity-50"
              title="Abort the run: kill the in-flight provider CLI and mark the run aborted."
            >
              <StopCircle className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              {busy === "abort" ? "Aborting…" : "Abort"}
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
      {/* Worktree / git context — collapsed by default so the title
       * row stays tight. One-click reveal when the user actually
       * needs the branch + path + Codebase / Git affordances. */}
      {run.worktreePath ? (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setWtOpen((v) => !v)}
            aria-expanded={wtOpen}
            className="amaco-mono inline-flex items-center gap-1 text-[10.5px] text-amaco-fg-muted hover:text-amaco-fg"
          >
            {wtOpen ? (
              <ChevronDown className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            ) : (
              <ChevronRight className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            )}
            <span>
              worktree {run.branchName ?? "(no branch)"}
            </span>
            {!wtOpen ? (
              <span className="truncate text-amaco-fg-muted/70">
                · {run.worktreePath}
              </span>
            ) : null}
          </button>
          {wtOpen ? (
            <div className="mt-2">
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
        </div>
      ) : null}
    </header>
  );
}

function FlowRunProgress({ run }: { run: RunState }) {
  const flow = run.flow;
  if (!flow) return null;
  const current =
    flow.steps.find((step) => step.id === flow.currentStepId) ?? null;
  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10.5px]">
      <span className="amaco-mono rounded border border-amaco-accent/40 bg-amaco-accent/10 px-1.5 py-0.5 text-amaco-accent">
        flow {flow.label}
      </span>
      {flow.steps.map((step) => (
        <span
          key={step.id}
          title={`${step.label}: ${step.status}`}
          className={`amaco-mono max-w-40 truncate rounded border px-1.5 py-0.5 ${
            step.id === current?.id
              ? "border-amaco-accent/50 text-amaco-accent"
              : step.status === "passed"
                ? "border-amaco-success/40 text-amaco-success"
                : step.status === "failed" || step.status === "blocked"
                  ? "border-amaco-fail/40 text-amaco-fail"
                  : "border-amaco-border text-amaco-fg-muted"
          }`}
        >
          {step.label}
        </span>
      ))}
      {flow.participants.map((participant) => (
        <span
          key={participant.slotId}
          title={
            participant.lastFallbackReason ??
            `${participant.providerType}:${participant.providerId}`
          }
          className="amaco-mono max-w-48 truncate rounded border border-amaco-border px-1.5 py-0.5 text-amaco-fg-dim"
        >
          {participant.label} {participant.lastContextMode ?? participant.sessionReuse}
        </span>
      ))}
    </div>
  );
}
