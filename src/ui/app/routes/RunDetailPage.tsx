import { useEffect, useMemo, useState } from "react";
import { api, type ProviderRow } from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { navigate, type ReplayFocus } from "../App.js";
import type {
  VibestrateEvent,
  ApprovalRequest,
  RunState,
  RuntimeMetrics,
} from "../../lib/types.js";
import { RunHeaderV3 } from "../../components/runs/v3/RunHeaderV3.js";
import { RunStatusSection } from "../../components/runs/v3/RunStatusSection.js";
import { CrewStrip } from "../../components/runs/v3/CrewStrip.js";
import { StepTimelineV3 } from "../../components/runs/v3/StepTimelineV3.js";
import {
  InspectorTabsV3,
  type InspectorV3Tab,
} from "../../components/runs/v3/InspectorTabs.js";
import { LiveOutputPanel } from "../../components/runs/LiveOutputPanel.js";
import { StepsInspector } from "../../components/runs/StepsInspector.js";
import { EventStream } from "../../components/workflow/EventStream.js";
import { ChangedFilesList } from "../../components/diff/ChangedFilesList.js";
import { ArtifactList } from "../../components/artifacts/ArtifactList.js";
import { ArtifactViewer } from "../../components/artifacts/ArtifactViewer.js";
import { ValidationSummary } from "../../components/validation/ValidationSummary.js";
import { ApprovalBanner } from "../../components/approvals/ApprovalBanner.js";
import { DiffViewer } from "../../components/diff/DiffViewer.js";
import { AlertTriangle, Bolt, Cpu, Scale } from "lucide-react";
import {
  describeRunOutcome,
  type RunOutcomeAction,
} from "../../lib/run-outcome.js";
import { Chip } from "../../components/design/Chip.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import type { InspectorTabId } from "../../components/layout/inspector-tabs.js";

const POLL_MS = 2000;

export function RunDetailPage({
  runId,
  initialTab,
  replayFocus,
}: {
  runId: string;
  initialTab?: InspectorTabId | null;
  replayFocus?: ReplayFocus | null;
}) {
  void replayFocus;
  const [run, setRun] = useState<RunState | null>(null);
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [diff, setDiff] = useState<
    { insertions: number; deletions: number; files: number } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [tab, setTab] = useState<InspectorV3Tab>(() =>
    initialTab === "artifact"
      ? "artifacts"
      : initialTab === "validation"
        ? "validation"
        : initialTab === "events"
          ? "events"
          : "steps",
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [r, m, a, d] = await Promise.all([
          api.getRun(runId),
          api.getMetrics(runId).catch(() => null),
          api.listApprovals(runId).catch(() => [] as ApprovalRequest[]),
          api.getDiff(runId).catch(() => null),
        ]);
        if (cancelled) return;
        setRun(r);
        setMetrics(m);
        setApprovals(a);
        setError(null);
        if (d) {
          setDiff({
            insertions: d.totals.insertions,
            deletions: d.totals.deletions,
            files: d.totals.files,
          });
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runId]);

  const pending = useMemo(
    () => approvals.find((a) => a.status === "pending") ?? null,
    [approvals],
  );
  const isApproval = run?.status === "waiting_for_approval";
  const skillsCount = run?.runtimeSkills?.length ?? 0;

  if (error)
    return (
      <div className="mx-auto max-w-[1480px] px-8 pt-6 text-rose-300">
        {error}
      </div>
    );
  if (!run)
    return (
      <div className="mx-auto max-w-[1480px] px-8 pt-6 text-fog-400">
        Loading run…
      </div>
    );

  const handlePauseToggle = async () => {
    try {
      if (run.status === "paused" || paused) {
        await api.resumeRun(runId);
        setPaused(false);
      } else {
        await api.pauseRun(runId);
        setPaused(true);
      }
    } catch {
      /* surface elsewhere */
    }
  };
  const handleAbort = async () => {
    if (!window.confirm(`Abort ${runId}? This will stop the active agent.`))
      return;
    try {
      await api.abortRun(runId);
    } catch {
      /* surface elsewhere */
    }
  };
  const handleApprove = async () => {
    if (!pending) return;
    try {
      await api.approveApproval({ runId, approvalId: pending.id });
    } catch {
      /* surface elsewhere */
    }
  };
  const handleReject = async () => {
    if (!pending) return;
    try {
      await api.rejectApproval({ runId, approvalId: pending.id });
    } catch {
      /* surface elsewhere */
    }
  };

  return (
    <div className="relative z-10 mx-auto max-w-[1480px] px-8 pt-6 pb-12 flex flex-col gap-5">
      <RunHeaderV3
        run={run}
        onBack={() => navigate({ kind: "mission" })}
        onOpenDiff={() => setTab("artifacts")}
        onOpenGit={() => navigate({ kind: "git", runId })}
        onRerun={() => setRerunOpen(true)}
      />

      {rerunOpen ? (
        <RerunDialog
          run={run}
          hasPlan={(metrics?.roles ?? []).some(
            (a) => a.stageId === "planning" || a.roleId === "planner",
          )}
          hasArchitecture={(metrics?.roles ?? []).some(
            (a) => a.stageId === "architecting" || a.roleId === "architect",
          )}
          onClose={() => setRerunOpen(false)}
          onSubmitted={() => {
            setRerunOpen(false);
            navigate({ kind: "mission" });
          }}
        />
      ) : null}

      <RunStatusSection
        run={run}
        diff={diff}
        skillsCount={skillsCount}
        paused={paused || run.status === "paused"}
        onPauseToggle={() => void handlePauseToggle()}
        onAbort={() => void handleAbort()}
        isApproval={!!isApproval && !!pending}
        onApprove={() => void handleApprove()}
        onReject={() => void handleReject()}
      />

      {/* Terminal non-success runs: explain what stopped it + what to do. */}
      <RunOutcomeBanner
        run={run}
        onRerun={() => setRerunOpen(true)}
        onOpenTab={(t) => setTab(t)}
      />

      {/* When the orchestrator is waiting on the user, surface the
       * approval banner inline (same UI used elsewhere in the app). */}
      {pending ? (
        <ApprovalBanner
          runId={runId}
          approval={pending}
          onResolved={(updated) =>
            setApprovals((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p)),
            )
          }
        />
      ) : null}

      <CrewStrip flow={run.flow ?? null} />

      <section className="grid grid-cols-12 gap-5" data-screen-label="03 Live execution">
        <div className="col-span-12 xl:col-span-8 min-h-0">
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="eyebrow">Live execution · raw provider CLI output</span>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-black/55 overflow-hidden">
            <LiveOutputPanel runId={runId} status={run.status} />
          </div>
        </div>

        <aside className="col-span-12 xl:col-span-4 min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
          <ActiveRolePanel run={run} metrics={metrics} />
          <div className="glass p-4">
            <ChangedFilesList
              runId={runId}
              selectedPath={null}
              onSelect={(p) =>
                navigate({ kind: "codebase", filePath: p, line: null, runId })
              }
            />
          </div>
        </aside>
      </section>

      <StepTimelineV3 flow={run.flow ?? null} />

      <section data-screen-label="05 Inspector">
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="eyebrow">Inspect</span>
          <InspectorTabsV3 current={tab} setCurrent={setTab} />
        </div>
        <div className="glass p-3.5">
          {tab === "steps" ? (
            <StepsInspector metrics={metrics} />
          ) : tab === "events" ? (
            <EventStream runId={runId} />
          ) : tab === "artifacts" ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 lg:col-span-5">
                <ArtifactList
                  runId={runId}
                  selectedPath={selectedArtifact}
                  onSelect={setSelectedArtifact}
                />
              </div>
              <div className="col-span-12 lg:col-span-7 min-h-[200px]">
                {selectedArtifact ? (
                  <ArtifactViewer
                    runId={runId}
                    path={selectedArtifact}
                    onOpenReference={(ref) =>
                      navigate({
                        kind: "codebase",
                        filePath: ref.file,
                        line: ref.lineStart,
                        runId,
                      })
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    <ChangedFilesList
                      runId={runId}
                      selectedPath={selectedFile}
                      onSelect={setSelectedFile}
                    />
                    <DiffViewer
                      runId={runId}
                      filePath={selectedFile}
                      onOpenInProject={(p) =>
                        navigate({
                          kind: "codebase",
                          filePath: p,
                          line: null,
                          runId: null,
                        })
                      }
                      onOpenInWorktree={(p) =>
                        navigate({
                          kind: "codebase",
                          filePath: p,
                          line: null,
                          runId,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <ValidationSummary runId={runId} />
          )}
        </div>
      </section>
    </div>
  );
}

function ActiveRolePanel({
  run,
  metrics,
}: {
  run: RunState;
  metrics: RuntimeMetrics | null;
}) {
  const agents = metrics?.roles ?? [];
  const agent =
    agents.find((a) => !a.endedAt) ?? agents.slice(-1)[0] ?? null;
  // Live totals accumulate as each step finishes — unlike the running agent's
  // own metrics, which only resolve when it exits (CLIs in -p mode buffer).
  const totalTokens = agents.reduce(
    (n, a) => n + (a.tokenUsage?.input ?? 0) + (a.tokenUsage?.output ?? 0),
    0,
  );
  const totalToolCalls = agents.reduce((n, a) => n + (a.toolCallCount ?? 0), 0);
  const anyCost = agents.some((a) => a.totalCostUsd !== null);
  const totalCost =
    metrics?.totalCostUsd ??
    (anyCost ? agents.reduce((n, a) => n + (a.totalCostUsd ?? 0), 0) : null);
  const costEstimated = agents.some((a) => a.costEstimated);
  const tokensEstimated = agents.some((a) => a.tokensEstimated);
  const stepsDone = agents.filter((a) => a.endedAt).length;
  return (
    <div className="glass p-4">
      <SectionEyebrow
        className="mb-3"
        right={
          <span className="mono text-[11px] text-fog-400 whitespace-nowrap">
            {stepsDone} step{stepsDone === 1 ? "" : "s"} done
          </span>
        }
      >
        Live metrics
      </SectionEyebrow>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-mid to-violet-deep ring-1 ring-violet-soft/40 flex items-center justify-center text-white shadow-[0_8px_22px_-8px_rgba(139,124,255,0.5)]">
          <Cpu className="h-4 w-4" strokeWidth={1.7} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] text-fog-100 font-medium truncate">
            {agent?.providerId ??
              run.resolvedProviderId ??
              run.providerOverride ??
              "auto"}
          </div>
          <div className="text-[11.5px] text-fog-400 truncate">
            {agent?.flowSlotId ?? agent?.stageId ?? "—"}
          </div>
        </div>
        <Chip tone={run.status === "executing" ? "violet" : "neutral"}>
          <span className="pulse-dot" /> {run.status}
        </Chip>
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2 text-[12px]">
        <Stat
          label={tokensEstimated ? "Tokens (est)" : "Tokens"}
          value={
            totalTokens > 0
              ? `${tokensEstimated ? "~" : ""}${fmtTokens(totalTokens)}`
              : "—"
          }
        />
        <Stat
          label={costEstimated ? "Cost (est)" : "Cost"}
          value={
            totalCost !== null
              ? `${costEstimated ? "~" : ""}$${totalCost.toFixed(4)}`
              : "—"
          }
        />
        <Stat
          label="Tool calls"
          value={totalToolCalls > 0 ? String(totalToolCalls) : "—"}
        />
        <Stat
          label="Provider calls"
          value={String(metrics?.totalProviderCalls ?? 0)}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-fog-400 text-[10.5px] uppercase tracking-[0.14em]">
        {label}
      </div>
      <div className="text-fog-100 mono num-tabular text-[15px]">{value}</div>
    </div>
  );
}

function RunOutcomeBanner({
  run,
  onRerun,
  onOpenTab,
}: {
  run: RunState;
  onRerun: () => void;
  onOpenTab: (t: InspectorV3Tab) => void;
}) {
  const outcome = describeRunOutcome(run);
  if (!outcome) return null;
  const rose = outcome.kind !== "aborted";
  const accent = rose
    ? "border-rose-400/30 bg-rose-500/[0.06]"
    : "border-white/10 bg-white/[0.03]";
  const label: Record<RunOutcomeAction, string> = {
    rerun: "Re-run with changes",
    review: "See review",
    events: "View events",
    diff: "View diff",
  };
  const run_ = (a: RunOutcomeAction) => {
    if (a === "rerun") onRerun();
    else if (a === "events") onOpenTab("events");
    else onOpenTab("artifacts"); // review + diff both live under Artifacts
  };
  return (
    <section
      className={`rounded-xl border ${accent} px-5 py-4`}
      data-screen-label="01b Outcome"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${rose ? "text-rose-300" : "text-fog-400"}`}
          strokeWidth={1.7}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-display text-[15px] text-fog-100">
            {outcome.title}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fog-300">
            {outcome.reason}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {outcome.actions.map((a, i) => (
              <button
                key={a}
                type="button"
                onClick={() => run_(a)}
                className={
                  i === 0
                    ? "h-8 rounded-lg bg-gradient-to-b from-violet-mid to-violet-deep px-3 text-[12px] text-white ring-1 ring-violet-soft/35"
                    : "h-8 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[12px] text-fog-200 hover:bg-white/[0.06]"
                }
              >
                {label[a]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type StartFrom = "scratch" | "architecting" | "executing";

function RerunDialog({
  run,
  hasPlan,
  hasArchitecture,
  onClose,
  onSubmitted,
}: {
  run: RunState;
  hasPlan: boolean;
  hasArchitecture: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [task, setTask] = useState(run.task);
  const [readOnly, setReadOnly] = useState(run.readOnly);
  const [effort, setEffort] = useState<"" | "low" | "medium" | "high">(
    run.effort ?? "",
  );
  const [provider, setProvider] = useState(run.providerOverride ?? "");
  // Rewind seeds the upstream steps and restarts at a stage. It's available
  // when the run's flow declares a step at that stage and the run captured the
  // upstream artifacts (every run is a flow run; the default flow has these
  // stages, custom flows may not). A fresh worktree is correct because these
  // stages regenerate the downstream code.
  const flowHasStage = (stage: string): boolean =>
    (run.flow?.steps ?? []).some((s) => s.stage === stage);
  const canArchitecting = flowHasStage("architecting") && hasPlan;
  const canExecuting = flowHasStage("executing") && hasPlan && hasArchitecture;
  const [startFrom, setStartFrom] = useState<StartFrom>("scratch");
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void api
      .listProviders()
      .then((r) => setProviders(r.providers.filter((p) => p.configured)))
      .catch(() => {});
  }, []);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.spawnRun({
        task,
        readOnly: readOnly || undefined,
        effort: effort || undefined,
        provider: provider || undefined,
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

  const selectCls =
    "rounded-md border border-white/10 bg-ink-200/70 px-2 py-1 text-[12.5px] text-fog-100 outline-none focus:border-violet-soft/40";

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="glass w-full max-w-[560px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Re-run with changes</div>
            <h2 className="text-display text-[18px] mt-0.5">
              {startFrom === "scratch"
                ? "New run from this task"
                : "Rewind & continue"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-fog-300 hover:text-fog-100"
          >
            Close
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-fog-500">
          {startFrom === "scratch"
            ? "Starts a fresh run (new worktree) with the task below and your adjusted settings — e.g. uncheck read-only so the executor can write. The original run is untouched."
            : startFrom === "architecting"
              ? "Forks a fresh run that reuses this run's plan and re-runs from architecture onward — no re-planning. The original run is untouched."
              : "Forks a fresh run that reuses this run's plan + architecture and re-runs from implementation onward — no re-planning or re-architecting. The original run is untouched."}
        </p>
        <div className="mt-3">
          <div className="eyebrow mb-1">Start from</div>
          <select
            value={startFrom}
            onChange={(e) => setStartFrom(e.target.value as StartFrom)}
            className={`${selectCls} w-full`}
          >
            <option value="scratch">Beginning — re-plan from scratch</option>
            <option value="architecting" disabled={!canArchitecting}>
              Architecture — reuse the plan{canArchitecting ? "" : " (unavailable)"}
            </option>
            <option value="executing" disabled={!canExecuting}>
              Implementation — reuse plan + architecture
              {canExecuting ? "" : " (unavailable)"}
            </option>
          </select>
          {!canArchitecting && !canExecuting ? (
            <p className="mt-1 text-[11px] text-fog-500">
              This flow has no resumable stage (or the upstream artifacts
              weren't captured) — re-runs start from the beginning.
            </p>
          ) : null}
        </div>
        <div className="mt-3">
          <div className="eyebrow mb-1">Task</div>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            disabled={startFrom !== "scratch"}
            className="w-full resize-y rounded-md border border-white/10 bg-ink-200/70 px-2.5 py-2 text-[13px] text-fog-100 outline-none focus:border-violet-soft/40 disabled:opacity-50"
          />
          {startFrom !== "scratch" ? (
            <p className="mt-1 text-[11px] text-fog-500">
              Locked — the reused plan was written for this task.
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-[12.5px] text-fog-300">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="accent-violet-500"
            />
            Read-only (no writes)
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-fog-300">
            effort
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as typeof effort)}
              className={selectCls}
            >
              <option value="">default</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-fog-300">
            provider
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className={selectCls}
            >
              <option value="">auto</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
        {err ? (
          <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
            {err}
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !task.trim()}
            onClick={() => void submit()}
          >
            {busy
              ? "Starting…"
              : startFrom === "scratch"
                ? "Start re-run"
                : "Start rewind"}
          </Button>
          <span className="text-[11px] text-fog-500">
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

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// Unused — kept so we can quickly add an inline "needs review" indicator
// later without re-importing icons.
void Bolt;
void Scale;
