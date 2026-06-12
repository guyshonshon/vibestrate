import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type ProviderRow } from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { navigate, type ReplayFocus } from "../App.js";
import type {
  VibestrateEvent,
  ApprovalRequest,
  EngagementEntry,
  RunAssurance,
  RunState,
  RuntimeMetrics,
  WorkflowSelectionView,
} from "../../lib/types.js";
import { RunHeaderV3 } from "../../components/runs/v3/RunHeaderV3.js";
import { RunStatusSection } from "../../components/runs/v3/RunStatusSection.js";
import { SupervisorPanel } from "../../components/runs/SupervisorPanel.js";
import { LiveTimeline } from "../../components/runs/LiveTimeline.js";
import { PanelBoard } from "../../components/layout/PanelBoard.js";
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
import { ReviewFindingsPanel } from "../../components/runs/ReviewFindingsPanel.js";
import { ApprovalBanner } from "../../components/approvals/ApprovalBanner.js";
import { DiffViewer } from "../../components/diff/DiffViewer.js";
import { WorktreeFileView } from "../../components/diff/WorktreeFileView.js";
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
  // Pre-seeded rewind stage for "Re-run with fixes" (null = start from scratch).
  const [rerunStart, setRerunStart] = useState<"executing" | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
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
  const [fileViewMode, setFileViewMode] = useState<"diff" | "file">("diff");
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [assurance, setAssurance] = useState<RunAssurance | null>(null);
  const [engagement, setEngagement] = useState<EngagementEntry[]>([]);
  const [arbitration, setArbitration] = useState<Record<string, unknown> | null>(
    null,
  );
  const [selection, setSelection] = useState<WorkflowSelectionView | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedOnce = false;
    const load = async () => {
      try {
        const [r, m, a, d, sel, eng, arb] = await Promise.all([
          api.getRun(runId),
          api.getMetrics(runId).catch(() => null),
          api.listApprovals(runId).catch(() => [] as ApprovalRequest[]),
          api.getDiff(runId).catch(() => null),
          api.getRunSelection(runId).catch(() => null),
          api.getRunEngagement(runId).catch(() => [] as EngagementEntry[]),
          api.getRunArbitration(runId).catch(() => null),
        ]);
        if (cancelled) return;
        loadedOnce = true;
        setRun(r);
        setMetrics(m);
        setApprovals(a);
        setSelection(sel);
        setEngagement(eng);
        setArbitration(arb);
        setError(null);
        // Assurance only exists once a run is terminal.
        if (["merge_ready", "blocked", "failed", "aborted"].includes(r.status)) {
          api
            .getRunAssurance(runId)
            .then((as) => {
              if (!cancelled) setAssurance(as);
            })
            .catch(() => {});
        }
        if (d) {
          setDiff({
            insertions: d.totals.insertions,
            deletions: d.totals.deletions,
            files: d.totals.files,
          });
        }
      } catch (err) {
        // A dashboard-spawned run is navigated to BEFORE its detached process
        // writes state.json - a 404 here just means "still starting", so keep
        // polling quietly instead of flashing an error.
        const starting =
          err instanceof ApiError && err.status === 404 && !loadedOnce;
        if (!cancelled && !starting)
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
  const skillsCount = run?.runtimeSkills?.length ?? 0;

  if (error)
    return (
      <div className="mx-auto max-w-[1480px] px-8 pt-6 text-rose-300">
        {error}
      </div>
    );
  if (!run)
    return (
      <div className="mx-auto max-w-[1480px] px-8 pt-6 flex items-center gap-2.5 text-fog-400">
        <span className="pulse-dot" />
        <span>
          Starting run
          <span className="text-fog-500">
            {" "}
            - creating the worktree and launching the first step…
          </span>
        </span>
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

  return (
    <div className="relative z-10 mx-auto max-w-[1480px] px-8 pt-6 pb-12 flex flex-col gap-5">
      <RunHeaderV3
        run={run}
        onBack={() => navigate({ kind: "mission" })}
        onOpenDiff={() => setTab("artifacts")}
        onOpenGit={() => navigate({ kind: "git", runId })}
        onRerun={() => {
          setRerunStart(null);
          setRerunOpen(true);
        }}
      />

      {rerunOpen ? (
        <RerunDialog
          run={run}
          initialStartFrom={rerunStart ?? undefined}
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

      {/* 1 - THE SUPERVISOR frames everything below: who judges, what it
       * decided about this task, its live decision feed, and any approval
       * it is waiting on. */}
      <SupervisorPanel
        selection={selection}
        assurance={assurance}
        engagement={engagement}
        arbitration={arbitration}
      >
        {pending ? (
          <div className="mt-2">
            <ApprovalBanner
              runId={runId}
              approval={pending}
              onResolved={(updated) =>
                setApprovals((prev) =>
                  prev.map((p) => (p.id === updated.id ? updated : p)),
                )
              }
            />
          </div>
        ) : null}
      </SupervisorPanel>

      {/* 2 - THE BRIEF: what you asked for, its live state, and the flow map. */}
      <RunStatusSection
        run={run}
        diff={diff}
        skillsCount={skillsCount}
        paused={paused || run.status === "paused"}
        onPauseToggle={() => void handlePauseToggle()}
        onAbort={() => void handleAbort()}
      />

      {/* Terminal verdict: ONE block. Assurance is the evidence-backed
       * verdict; the outcome banner only fills the gap before assurance is
       * written (the two stacked banners used to say the same thing twice). */}
      {assurance ? (
        <AssuranceBadge
          assurance={assurance}
          onViewReview={
            assurance.review.status === "changes_requested" ||
            run.finalDecision === "CHANGES_REQUESTED" ||
            run.finalDecision === "BLOCKED"
              ? () => setReviewOpen(true)
              : undefined
          }
          onRerunWithFixes={() => {
            setRerunStart("executing");
            setRerunOpen(true);
          }}
          onViewValidation={
            assurance.validation.status === "failed"
              ? () => setTab("validation")
              : undefined
          }
        />
      ) : (
        <RunOutcomeBanner
          run={run}
          onRerun={() => setRerunOpen(true)}
          onOpenReview={() => setReviewOpen(true)}
          onOpenTab={(t) => setTab(t)}
        />
      )}

      {reviewOpen ? (
        <ReviewFindingsPanel
          runId={runId}
          flow={run.flow}
          onClose={() => setReviewOpen(false)}
          onRerunWithFixes={() => {
            setRerunStart("executing");
            setRerunOpen(true);
          }}
        />
      ) : null}

      <PanelBoard
        storageKey="vibestrate.rundetail.layout.v2"
        panels={[
          // The live timeline (P8b): replaces the run graph + seat board pair
          // with the one surface that answers "what is happening right now".
          ...(run.flow
            ? [
                {
                  id: "timeline",
                  title: "Live timeline",
                  defaultLayout: { id: "timeline", x: 0, y: 0, w: 8, h: 9 },
                  minW: 4,
                  minH: 5,
                  render: () => (
                    <LiveTimeline
                      runId={runId}
                      status={run.status}
                      flow={run.flow}
                      metrics={metrics}
                    />
                  ),
                },
              ]
            : []),
          {
            id: "metrics",
            title: "Live metrics",
            defaultLayout: { id: "metrics", x: 8, y: 0, w: 4, h: 5 },
            minW: 3,
            minH: 4,
            render: () => <ActiveRolePanel run={run} metrics={metrics} />,
          },
          {
            id: "files",
            title: "Changed files",
            defaultLayout: { id: "files", x: 8, y: 5, w: 4, h: 4 },
            minW: 3,
            minH: 3,
            render: () => (
              <ChangedFilesList
                runId={runId}
                selectedPath={selectedFile}
                // Stay on this screen: select the file into the inspector's
                // artifacts tab (diff + worktree file view) instead of
                // navigating away to the Codebase page.
                onSelect={(p) => {
                  setSelectedArtifact(null);
                  setSelectedFile(p);
                  setFileViewMode("file");
                  setTab("artifacts");
                }}
              />
            ),
          },
          {
            id: "live",
            title: "Live execution",
            defaultLayout: { id: "live", x: 0, y: 9, w: 12, h: 6 },
            minW: 4,
            minH: 4,
            render: () => (
              <div className="h-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/55">
                <LiveOutputPanel runId={runId} status={run.status} />
              </div>
            ),
          },
        ]}
      />

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
                    {/* Diff and full file contents side by side as a toggle -
                     * a generated file is viewable HERE, in the worktree it
                     * actually lives in, without leaving the run screen. */}
                    {selectedFile ? (
                      <div className="inline-flex rounded-md border border-white/10 p-0.5 text-[11.5px]">
                        {(["diff", "file"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setFileViewMode(m)}
                            className={cnFileTab(fileViewMode === m)}
                          >
                            {m === "diff" ? "Diff" : "File"}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {fileViewMode === "file" && selectedFile ? (
                      <WorktreeFileView runId={runId} filePath={selectedFile} />
                    ) : (
                      <DiffViewer
                        runId={runId}
                        filePath={selectedFile}
                        onOpenInWorktree={(p) =>
                          navigate({
                            kind: "codebase",
                            filePath: p,
                            line: null,
                            runId,
                          })
                        }
                      />
                    )}
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

function cnFileTab(active: boolean): string {
  return active
    ? "rounded px-2 py-0.5 bg-white/[0.08] text-fog-100"
    : "rounded px-2 py-0.5 text-fog-400 hover:text-fog-200";
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
  // Live totals accumulate as each step finishes - unlike the running agent's
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
    <div>
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
              run.profileOverride ?? run.crewId ??
              "auto"}
          </div>
          <div className="text-[11.5px] text-fog-400 truncate">
            {agent?.flowSeat ?? agent?.stageId ?? "-"}
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
              : "-"
          }
        />
        <Stat
          label={costEstimated ? "Cost (est)" : "Cost"}
          value={
            totalCost !== null
              ? `${costEstimated ? "~" : ""}$${totalCost.toFixed(4)}`
              : "-"
          }
        />
        <Stat
          label="Tool calls"
          value={totalToolCalls > 0 ? String(totalToolCalls) : "-"}
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
  onOpenReview,
  onOpenTab,
}: {
  run: RunState;
  onRerun: () => void;
  onOpenReview: () => void;
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
    else if (a === "review") onOpenReview();
    else onOpenTab("artifacts"); // diff lives under Artifacts
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
  const [effort, setEffort] = useState<"" | "low" | "medium" | "high">(
    run.effort ?? "",
  );
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
            ? "Starts a fresh run (new worktree) with the task below and your adjusted settings - e.g. uncheck read-only so the executor can write. The original run is untouched."
            : startFrom === "architecting"
              ? "Forks a fresh run that reuses this run's plan and re-runs from architecture onward - no re-planning. The original run is untouched."
              : "Forks a fresh run that reuses this run's plan + architecture and re-runs from implementation onward - no re-planning or re-architecting. The original run is untouched."}
        </p>
        <div className="mt-3">
          <div className="eyebrow mb-1">Start from</div>
          <select
            value={startFrom}
            onChange={(e) => setStartFrom(e.target.value as StartFrom)}
            className={`${selectCls} w-full`}
          >
            <option value="scratch">Beginning - re-plan from scratch</option>
            <option value="architecting" disabled={!canArchitecting}>
              Architecture - reuse the plan{canArchitecting ? "" : " (unavailable)"}
            </option>
            <option value="executing" disabled={!canExecuting}>
              Implementation - reuse plan + architecture
              {canExecuting ? "" : " (unavailable)"}
            </option>
          </select>
          {!canArchitecting && !canExecuting ? (
            <p className="mt-1 text-[11px] text-fog-500">
              This flow has no resumable stage (or the upstream artifacts
              weren't captured) - re-runs start from the beginning.
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
              Locked - the reused plan was written for this task.
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

const ASSURANCE_TONE: Record<RunAssurance["verdict"], string> = {
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  partially_verified: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  unverified: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  blocked: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  unsafe: "border-rose-500/50 bg-rose-500/15 text-rose-200",
};

/** Why the orchestrator chose this Flow (Slice 2 - only for selected runs). */

/** Compact, evidence-backed run-assurance verdict (S5). */
function AssuranceBadge({
  assurance,
  onViewReview,
  onRerunWithFixes,
  onViewValidation,
}: {
  assurance: RunAssurance;
  onViewReview?: () => void;
  onRerunWithFixes?: () => void;
  onViewValidation?: () => void;
}) {
  const a = assurance;
  const actionCls =
    "h-7 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 text-[11.5px] hover:bg-white/[0.1]";
  return (
    <div className={`rounded-xl border px-4 py-3 ${ASSURANCE_TONE[a.verdict]}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] uppercase tracking-[0.12em] opacity-70">
          Run assurance
        </span>
        <span className="text-sm font-semibold">
          {a.verdict.replace(/_/g, " ")}
        </span>
        <span className="text-xs opacity-80">{a.summary}</span>
        {onViewReview || onViewValidation ? (
          <span className="ml-auto flex items-center gap-2">
            {onViewReview ? (
              <button type="button" onClick={onViewReview} className={actionCls}>
                View review
              </button>
            ) : null}
            {onViewReview && onRerunWithFixes ? (
              <button
                type="button"
                onClick={onRerunWithFixes}
                className={actionCls}
              >
                Re-run with fixes
              </button>
            ) : null}
            {onViewValidation ? (
              <button
                type="button"
                onClick={onViewValidation}
                className={actionCls}
              >
                View validation
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] opacity-80">
        <span>policy: {a.policy.status}</span>
        <span>
          validation: {a.validation.status.replace(/_/g, " ")} ({a.validation.passed}/
          {a.validation.total})
          {a.validation.status === "environment"
            ? " - toolchain missing in the worktree, nothing was actually checked"
            : ""}
        </span>
        <span>review: {a.review.status.replace(/_/g, " ")}</span>
        <span>verification: {a.verification.status.replace(/_/g, " ")}</span>
        {(a.coverage?.toleratedStepFailures ?? 0) > 0 ? (
          <span>
            coverage: {a.coverage.toleratedStepFailures} tolerated failure
            {a.coverage.toleratedStepFailures === 1 ? "" : "s"}
          </span>
        ) : null}
        {a.supervisor?.persona ? (
          <span title="The supervisor's review independence is honest, not a confidence source - single-profile is a same-model self-check that can only lower confidence.">
            supervisor: {a.supervisor.persona} ({a.supervisor.independence})
          </span>
        ) : null}
      </div>
      {a.blockers && a.blockers.length > 0 ? (
        <div className="mt-2 space-y-0.5">
          {a.blockers.map((b, i) => (
            <div key={i} className="text-[11.5px]">
              <span className="font-semibold">
                cause{b.stepId ? ` at ${b.stepId}` : ""}
                {b.class ? ` · ${b.class}` : ""}:
              </span>{" "}
              <span className="opacity-90">{b.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
      {(a.caps?.length ?? 0) > 0 ? (
        <div className="mt-1 text-[11px] opacity-60">
          caps: {a.caps.join(", ")}
        </div>
      ) : null}
      {(a.notes?.length ?? 0) > 0 ? (
        <div className="mt-1 text-[11px] opacity-50">
          notes: {a.notes!.map(humanizeAssuranceNote).join(", ")}
        </div>
      ) : null}
    </div>
  );
}

/** Turn an assurance note code into a short human phrase. Notes are
 *  informational (a lane that wasn't required) - never a verdict-capping gap. */
function humanizeAssuranceNote(code: string): string {
  switch (code) {
    case "validation_not_required":
      return "validation not required";
    case "validation_skipped_inert":
      return "validation skipped (inert change)";
    case "review_skipped_inert_diff":
      return "review skipped (inert diff)";
    case "review_not_required":
      return "no review needed";
    case "verification_not_required":
      return "verification not required";
    default:
      return code.replace(/_/g, " ");
  }
}

// Unused - kept so we can quickly add an inline "needs review" indicator
// later without re-importing icons.
void Bolt;
void Scale;
