import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  type ProviderRow,
  type RestorePreview,
} from "../../../lib/api.js";
import { Button } from "../../../components/design/Button.js";
import { navigate, type ReplayFocus } from "../../App.js";
import type {
  VibestrateEvent,
  ApprovalRequest,
  EngagementEntry,
  PerItemVerdict,
  RunAssurance,
  RunAudit,
  RunState,
  RuntimeMetrics,
  SpecUpQuestion,
  WorkflowSelectionView,
} from "../../../lib/types.js";
import {
  InspectorTabsV3,
  type InspectorV3Tab,
} from "../../../components/runs/v3/InspectorTabs.js";
import {
  describeRunOutcome,
  type RunOutcomeAction,
} from "../../../lib/run-outcome.js";
import { Select } from "../../../components/design/Select.js";
import type { InspectorTabId } from "../../../components/layout/inspector-tabs.js";
import type { StartFrom } from "./shared.js";
import { DOWNSTREAM_STAGES } from "./shared.js";

function isDownstreamStage(
  s: StartFrom,
): s is "reviewing" | "fixing" | "verifying" {
  return (DOWNSTREAM_STAGES as readonly string[]).includes(s);
}


export function RerunDialog({
  run,
  hasPlan,
  hasArchitecture,
  initialStartFrom,
  onClose,
  onSubmitted,
}: {
  run: RunState;
  hasPlan: boolean;
  hasArchitecture: boolean;
  /** Pre-seed the rewind stage (e.g. "Re-run with fixes" lands on executing). */
  initialStartFrom?: StartFrom;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [task, setTask] = useState(run.task);
  const [readOnly, setReadOnly] = useState(run.readOnly);
  const [provider, setProvider] = useState(run.profileOverride ?? "");
  // Rewind seeds the upstream steps and restarts at a stage. It's available
  // when the run's flow declares a step at that stage and the run captured the
  // upstream artifacts (every run is a flow run; the default flow has these
  // stages, custom flows may not). A fresh worktree is correct because these
  // stages regenerate the downstream code.
  const flowHasStage = (stage: string): boolean =>
    (run.flow?.steps ?? []).some((s) => s.stage === stage);
  const canArchitecting = flowHasStage("architecting") && hasPlan;
  const canExecuting = flowHasStage("executing") && hasPlan && hasArchitecture;
  // Downstream stages restore the source run's code snapshot (a destructive
  // restore into a fresh worktree). Offered when the flow has the stage; real
  // snapshot availability is confirmed by the preview fetch below.
  const canReviewing = flowHasStage("reviewing");
  const canFixing = flowHasStage("fixing");
  const canVerifying = flowHasStage("verifying");
  // Honor the pre-seed only when that stage is actually resumable; otherwise
  // fall back to scratch rather than presenting a disabled selection.
  const [startFrom, setStartFrom] = useState<StartFrom>(() =>
    initialStartFrom === "executing" && canExecuting
      ? "executing"
      : initialStartFrom === "architecting" && canArchitecting
        ? "architecting"
        : "scratch",
  );
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Restore dry-run for the selected downstream stage.
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [previewState, setPreviewState] = useState<
    "idle" | "loading" | "none" | "ready" | "error"
  >("idle");

  // Safe to degrade silently: this only populates the optional provider-override
  // list. With it empty the dialog still offers "default", and the re-run goes
  // to the project's configured provider - the same thing it would do untouched.
  useEffect(() => {
    void api
      .listProviders()
      .then((r) => setProviders(r.providers.filter((p) => p.configured)))
      .catch(() => {});
  }, []);

  // Fetch the restore preview whenever a downstream stage is selected, so the
  // user sees the overwrite/remove blast radius before launching the rewind.
  useEffect(() => {
    if (!isDownstreamStage(startFrom)) {
      setPreview(null);
      setPreviewState("idle");
      return;
    }
    let alive = true;
    setPreviewState("loading");
    void api
      .restorePreview(run.runId, startFrom)
      .then((r) => {
        if (!alive) return;
        setPreview(r.preview);
        setPreviewState(r.preview ? "ready" : "none");
      })
      .catch(() => {
        if (!alive) return;
        setPreview(null);
        setPreviewState("error");
      });
    return () => {
      alive = false;
    };
  }, [startFrom, run.runId]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.spawnRun({
        task,
        readOnly: readOnly || undefined,
        profileOverride: provider || undefined,
        // Re-run the same flow (resume seeds the upstream steps of that flow).
        // Omitting it for the built-in default is also fine, but passing the id
        // keeps a resumed custom flow on its own definition.
        flow:
          run.flow && run.flow.flowId !== "default"
            ? { id: run.flow.flowId }
            : undefined,
        resumeFrom:
          startFrom === "scratch"
            ? undefined
            : { sourceRunId: run.runId, fromStage: startFrom },
      });
      onSubmitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-coal-900/80 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-[20px] border border-[color:var(--line)] bg-coal-700 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-violet-soft">Re-run with changes</div>
            <h2 className="mt-0.5 text-[18px] font-semibold text-chalk-100">
              {startFrom === "scratch"
                ? "New run from this task"
                : "Rewind & continue"}
            </h2>
          </div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] text-chalk-300">
          {startFrom === "scratch"
            ? "Starts a fresh run (new worktree) with the task below and your adjusted settings - e.g. uncheck read-only so the executor can write. The original run is untouched."
            : startFrom === "architecting"
              ? "Forks a fresh run that reuses this run's plan and re-runs from architecture onward - no re-planning. The original run is untouched."
              : startFrom === "executing"
                ? "Forks a fresh run that reuses this run's plan + architecture and re-runs from implementation onward - no re-planning or re-architecting. The original run is untouched."
                : "Forks a fresh run that restores this run's code snapshot into a new worktree and resumes from there. The preview below shows exactly what the restore writes. The original run is untouched."}
        </p>
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-semibold text-violet-soft">Start from</div>
          {(() => {
            // Per-stage availability mirrors the old native `disabled` options:
            // unavailable stages stay visible (labelled "unavailable") but can't
            // be selected, since the shared Select has no per-option disabled.
            const stageAvailable: Record<StartFrom, boolean> = {
              scratch: true,
              architecting: canArchitecting,
              executing: canExecuting,
              reviewing: canReviewing,
              fixing: canFixing,
              verifying: canVerifying,
            };
            return (
              <Select
                value={startFrom}
                ariaLabel="Start the re-run from this stage"
                className="w-full"
                onChange={(v) => {
                  const next = v as StartFrom;
                  if (stageAvailable[next]) setStartFrom(next);
                }}
                options={[
                  { value: "scratch", label: "Beginning - re-plan from scratch" },
                  {
                    value: "architecting",
                    label: "Architecture - reuse the plan",
                    hint: canArchitecting ? undefined : "unavailable",
                  },
                  {
                    value: "executing",
                    label: "Implementation - reuse plan + architecture",
                    hint: canExecuting ? undefined : "unavailable",
                  },
                  {
                    value: "reviewing",
                    label: "Review - restore this run's code",
                    hint: canReviewing ? undefined : "unavailable",
                  },
                  {
                    value: "fixing",
                    label: "Fix - restore this run's code",
                    hint: canFixing ? undefined : "unavailable",
                  },
                  {
                    value: "verifying",
                    label: "Verify - restore this run's code",
                    hint: canVerifying ? undefined : "unavailable",
                  },
                ]}
              />
            );
          })()}
          {!canArchitecting && !canExecuting ? (
            <p className="mt-1 text-[11px] text-chalk-400">
              This flow has no resumable stage (or the upstream artifacts
              weren't captured) - re-runs start from the beginning.
            </p>
          ) : null}
          {isDownstreamStage(startFrom) ? (
            <div className="mt-2 rounded-[12px] border border-[color:var(--line)] bg-coal-800 p-2.5">
              <div className="mb-1 text-[12px] font-semibold text-violet-soft">
                Restore preview (dry run)
              </div>
              {previewState === "loading" ? (
                <p className="text-[11px] text-chalk-300">Computing the overwrite/remove set…</p>
              ) : previewState === "none" ? (
                <p className="text-[11px] text-amber-soft">
                  No code snapshot for this stage - this run can't be rewound to{" "}
                  {startFrom}. Pick another stage.
                </p>
              ) : previewState === "error" ? (
                <p className="text-[11px] text-chalk-300">Couldn't load the preview.</p>
              ) : preview ? (
                <div className="text-[11px] text-chalk-300">
                  <p>
                    Restores the <b>{preview.stage}</b> snapshot over{" "}
                    <b>{preview.baseRef}</b>:{" "}
                    <b>{preview.filesChanged}</b> file(s),{" "}
                    <span className="text-emerald-400">+{preview.insertions}</span>{" "}
                    <span className="text-rose-300">-{preview.deletions}</span>.
                  </p>
                  <ul className="mt-1 max-h-32 overflow-y-auto font-mono text-[10.5px] leading-relaxed">
                    {preview.files.slice(0, 50).map((f) => (
                      <li key={f.path}>
                        <span
                          className={
                            f.status === "added"
                              ? "text-emerald-400"
                              : f.status === "deleted"
                                ? "text-rose-300"
                                : "text-chalk-400"
                          }
                        >
                          {f.status === "added"
                            ? "+"
                            : f.status === "deleted"
                              ? "-"
                              : "~"}
                        </span>{" "}
                        {f.path}
                      </li>
                    ))}
                    {preview.files.length > 50 ? (
                      <li className="text-chalk-400">
                        … and {preview.files.length - 50} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-semibold text-violet-soft">Task</div>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            disabled={startFrom !== "scratch"}
            className="w-full resize-y rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-2 text-[13px] text-chalk-100 outline-none focus:border-violet-soft/50 disabled:opacity-50"
          />
          {startFrom !== "scratch" ? (
            <p className="mt-1 text-[11px] text-chalk-400">
              Locked - the reused plan was written for this task.
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-[12.5px] text-chalk-300">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="accent-violet-soft"
            />
            Read-only (no writes)
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-chalk-300">
            provider
            <Select
              value={provider}
              ariaLabel="Provider override"
              className="min-w-[150px]"
              onChange={(v) => setProvider(v)}
              options={[
                { value: "", label: "auto" },
                ...providers.map((p) => ({ value: p.id, label: p.label })),
              ]}
            />
          </label>
        </div>
        {err ? (
          <div className="mt-3 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {err}
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            disabled={
              busy ||
              !task.trim() ||
              // A downstream rewind with no restorable snapshot can't launch.
              (isDownstreamStage(startFrom) &&
                (previewState === "none" || previewState === "loading"))
            }
            onClick={() => void submit()}
          >
            {busy
              ? "Starting…"
              : startFrom === "scratch"
                ? "Start re-run"
                : "Start rewind"}
          </Button>
          <span className="text-[11px] text-chalk-400">
            {readOnly ? "read-only" : "writes enabled"}
            {startFrom === "scratch"
              ? run.flow
                ? ` · flow: ${run.flow.flowId}`
                : ""
              : ` · resumes at ${startFrom}`}
          </span>
        </div>
      </div>
    </div>
  );
}
