import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  type ProviderRow,
  type RestorePreview,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { LoadingState } from "../../components/design/ErrorState.js";
import { ErrorView } from "../../lib/error-view.js";
import { navigate, type ReplayFocus } from "../App.js";
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
} from "../../lib/types.js";
import { RunTree } from "../../components/runs/RunTree.js";
import { RunGapQuestions } from "../../components/runs/RunGapQuestions.js";
import { SpecUpRunActions } from "../../components/runs/SpecUpRunActions.js";
import { SpecUpReview } from "../../components/runs/SpecUpReview.js";
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
import { StartupPanel } from "../../components/runs/StartupPanel.js";
import { ApprovalBanner } from "../../components/approvals/ApprovalBanner.js";
import { DiffViewer } from "../../components/diff/DiffViewer.js";
import { WorktreeFileView } from "../../components/diff/WorktreeFileView.js";
import { AlertTriangle, Bolt, Cpu, FolderTree, Scale, ShieldCheck } from "lucide-react";
import {
  describeRunOutcome,
  type RunOutcomeAction,
} from "../../lib/run-outcome.js";
import { RunStatusBadge } from "../../components/runs/RunStatusBadge.js";
import { Select } from "../../components/design/Select.js";
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
  const [error, setError] = useState<unknown>(null);
  // A dashboard-spawned run is opened before its detached process writes
  // state.json, so an early 404 means "still starting". But a genuinely missing
  // run 404s forever - past this grace window we stop masking it as loading and
  // surface the not-found error (otherwise a deleted/bad runId spins forever).
  const openedAtRef = useRef<number>(Date.now());
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
  const [audit, setAudit] = useState<RunAudit | null>(null);
  const [specUpQuestions, setSpecUpQuestions] = useState<SpecUpQuestion[] | null>(null);
  const [specUpMeta, setSpecUpMeta] = useState<{ round: number; coverageComplete: boolean } | null>(null);
  const [arbitration, setArbitration] = useState<Record<string, unknown> | null>(
    null,
  );
  const [selection, setSelection] = useState<WorkflowSelectionView | null>(null);
  const [checklistVerdicts, setChecklistVerdicts] = useState<PerItemVerdict[]>([]);

  useEffect(() => {
    let cancelled = false;
    let loadedOnce = false;
    const load = async () => {
      try {
        const [r, m, a, d, sel, eng, arb, aud, shp, cv] = await Promise.all([
          api.getRun(runId),
          api.getMetrics(runId).catch(() => null),
          api.listApprovals(runId).catch(() => [] as ApprovalRequest[]),
          api.getDiff(runId).catch(() => null),
          api.getRunSelection(runId).catch(() => null),
          api.getRunEngagement(runId).catch(() => [] as EngagementEntry[]),
          api.getRunArbitration(runId).catch(() => null),
          api.getRunAudit(runId).catch(() => null),
          api.getSpecUpQuestions(runId).catch(() => null),
          api.getChecklistVerdicts(runId).catch(() => [] as PerItemVerdict[]),
        ]);
        if (cancelled) return;
        loadedOnce = true;
        setRun(r);
        setMetrics(m);
        setApprovals(a);
        setSelection(sel);
        setEngagement(eng);
        setArbitration(arb);
        setAudit(aud);
        setChecklistVerdicts(cv);
        setSpecUpQuestions(shp?.questions ?? null);
        setSpecUpMeta(
          shp && shp.questions != null
            ? { round: shp.round ?? 1, coverageComplete: shp.coverageComplete ?? false }
            : null,
        );
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
        const starting =
          err instanceof ApiError &&
          err.status === 404 &&
          !loadedOnce &&
          Date.now() - openedAtRef.current < 8000;
        if (!cancelled && !starting) setError(err);
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
      <PageShell>
        <div className="mx-auto max-w-[560px] pt-10">
          <ErrorView
            err={error}
            actions={[
              { label: "Back to runs", onClick: () => navigate({ kind: "runs" }) },
              { label: "New run", onClick: () => navigate({ kind: "compose" }) },
              { label: "Mission control", onClick: () => navigate({ kind: "mission" }) },
            ]}
          />
        </div>
      </PageShell>
    );
  if (!run)
    return (
      <PageShell>
        <div className="mx-auto max-w-[560px] pt-10">
          <LoadingState
            title="Starting run"
            detail="Creating the worktree and launching the first step. This usually takes a few seconds."
          />
        </div>
      </PageShell>
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
  const handleRename = async (name: string) => {
    try {
      const updated = await api.renameRun(runId, name);
      setRun(updated);
    } catch {
      /* the input reverts on next poll */
    }
  };

  // Spec-up phase: when the supervisor routed this run into the read-only
  // spec-up-intake flow, it terminates having emitted gap questions. Show those
  // as the run's surface - answering them launches the spec-up run and hands
  // off to it. (The questions artifact persists on the intake run, so revisiting
  // it re-offers them; the chain moves forward via the spawned run.)
  const awaitingSpecUpAnswers =
    run.flow?.flowId === "spec-up-intake" &&
    specUpQuestions != null &&
    ((specUpQuestions.length ?? 0) > 0 || (specUpMeta?.coverageComplete ?? false));
  if (awaitingSpecUpAnswers) {
    return (
      <div className="deep-scene relative z-10 mx-auto max-w-[1520px] px-8 pt-6 pb-12 flex flex-col gap-5">
        <RunHeaderV3
          run={run}
          onBack={() => navigate({ kind: "mission" })}
          onOpenDiff={() => setTab("artifacts")}
          onOpenGit={() => navigate({ kind: "git", runId })}
          onRerun={() => {
            setRerunStart(null);
            setRerunOpen(true);
          }}
          onRename={handleRename}
        />
        <RunGapQuestions
          runId={runId}
          questions={specUpQuestions!}
          round={specUpMeta?.round ?? 1}
          coverageComplete={specUpMeta?.coverageComplete ?? false}
          onSubmitted={(nextRunId) => navigate({ kind: "run", runId: nextRunId })}
        />
      </div>
    );
  }

  return (
    <div className="deep-scene relative z-10 mx-auto max-w-[1520px] px-8 pt-6 pb-12 flex flex-col gap-5">
      <RunHeaderV3
        run={run}
        onBack={() => navigate({ kind: "mission" })}
        onOpenDiff={() => setTab("artifacts")}
        onOpenGit={() => navigate({ kind: "git", runId })}
        onRerun={() => {
          setRerunStart(null);
          setRerunOpen(true);
        }}
        onRename={handleRename}
      />

      <SpecUpReview runId={runId} flowId={run.flow?.flowId} />
      <SpecUpRunActions
        runId={runId}
        run={run}
        onOpenRun={(id) => navigate({ kind: "run", runId: id })}
        onOpenProposal={(id) => navigate({ kind: "proposal", proposalId: id })}
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

      {/* Staged "starting up" checklist: self-hides once the run is past
          startup (or stays to show the failed stage). */}
      <StartupPanel runId={runId} status={run.status} />

      {run.worktreePath ? (
        <WorkspacePanel
          worktreePath={run.worktreePath}
          branchName={run.branchName}
        />
      ) : null}

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
              <div className="h-full overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-coal-900">
                <LiveOutputPanel runId={runId} status={run.status} />
              </div>
            ),
          },
        ]}
      />

      <section data-screen-label="05 Inspector">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="mono text-[11px] text-chalk-400">Inspect</span>
          <InspectorTabsV3 current={tab} setCurrent={setTab} />
        </div>
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-3.5">
          {tab === "tree" ? (
            <RunTree audit={audit} engagement={engagement} checklistVerdicts={checklistVerdicts} />
          ) : tab === "steps" ? (
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
                      <div className="inline-flex rounded-[10px] border border-[color:var(--line)] p-0.5 text-[11.5px]">
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
    ? "rounded-[8px] bg-coal-500 px-2 py-0.5 text-chalk-100"
    : "rounded-[8px] px-2 py-0.5 text-chalk-300 hover:text-chalk-100";
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
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="mono text-[11px] text-chalk-400">Live metrics</span>
        <span className="mono text-[11px] text-chalk-400 whitespace-nowrap">
          {stepsDone} step{stepsDone === 1 ? "" : "s"} done
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-violet-soft/15 text-violet-soft ring-1 ring-violet-soft/30">
          <Cpu className="h-4 w-4" strokeWidth={1.9} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-chalk-100">
            {agent?.providerId ??
              run.profileOverride ?? run.crewId ??
              "auto"}
          </div>
          <div className="truncate text-[11.5px] text-chalk-300">
            {agent?.flowSeat ?? agent?.stageId ?? "-"}
          </div>
        </div>
        <RunStatusBadge status={run.status} compact />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[color:var(--line-soft)] pt-3 text-[12px]">
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
      <div className="text-[10.5px] text-chalk-400">{label}</div>
      <div className="mono num-tabular text-[15px] text-chalk-100">{value}</div>
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
    ? "border-rose-400/30 bg-rose-500/10"
    : "border-[color:var(--line)] bg-coal-600";
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
      className={`rounded-[18px] border ${accent} px-5 py-4`}
      data-screen-label="01b Outcome"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${rose ? "text-rose-300" : "text-chalk-300"}`}
          strokeWidth={1.9}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-chalk-100">
            {outcome.title}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-chalk-300">
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
                    ? "h-8 rounded-[10px] bg-violet-soft px-3 text-[12.5px] font-semibold text-coal-900 transition hover:bg-violet-soft/90"
                    : "h-8 rounded-[10px] border border-[color:var(--line-strong)] bg-coal-600 px-3 text-[12.5px] font-semibold text-chalk-300 transition hover:bg-coal-500 hover:text-chalk-100"
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

type StartFrom =
  | "scratch"
  | "architecting"
  | "executing"
  | "reviewing"
  | "fixing"
  | "verifying";

const DOWNSTREAM_STAGES = ["reviewing", "fixing", "verifying"] as const;
function isDownstreamStage(
  s: StartFrom,
): s is "reviewing" | "fixing" | "verifying" {
  return (DOWNSTREAM_STAGES as readonly string[]).includes(s);
}

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
            <div className="mono text-[11px] text-chalk-400">Re-run with changes</div>
            <h2 className="mt-0.5 text-[18px] font-semibold text-chalk-100">
              {startFrom === "scratch"
                ? "New run from this task"
                : "Rewind & continue"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[color:var(--line-strong)] bg-coal-600 px-2 py-1 text-[12px] text-chalk-300 transition hover:text-chalk-100"
          >
            Close
          </button>
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
          <div className="mono mb-1 text-[11px] text-chalk-400">Start from</div>
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
              <div className="mono mb-1 text-[11px] text-chalk-400">
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
          <div className="mono mb-1 text-[11px] text-chalk-400">Task</div>
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

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const VERDICT_META: Record<
  RunAssurance["verdict"],
  { tone: string; card: string; icon: typeof Scale }
> = {
  verified: { tone: "text-emerald-400", card: "border-emerald-500/30 bg-emerald-500/[0.04]", icon: ShieldCheck },
  partially_verified: { tone: "text-amber-soft", card: "border-amber-soft/30 bg-amber-soft/[0.05]", icon: Scale },
  unverified: { tone: "text-amber-soft", card: "border-amber-soft/30 bg-amber-soft/[0.05]", icon: Scale },
  blocked: { tone: "text-rose-300", card: "border-rose-400/35 bg-rose-500/[0.06]", icon: AlertTriangle },
  unsafe: { tone: "text-rose-300", card: "border-rose-400/45 bg-rose-500/[0.08]", icon: AlertTriangle },
};

/** Per-gate status color: a passed gate is emerald, a failed/blocked one rose,
 *  a missing/not-run one stays muted, an environment skip is amber. */
function laneTone(status: string): string {
  const s = status.toLowerCase();
  if (/(passed|verified|approved|^ok$)/.test(s)) return "text-emerald-400";
  if (/(fail|blocked|changes|unsafe|reject)/.test(s)) return "text-rose-300";
  if (s.includes("environment")) return "text-amber-soft";
  return "text-chalk-400";
}

/** One gate cell in the assurance grid (label over a status-tinted value). */
function LaneCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-[12px] bg-coal-500/50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-chalk-400">
        {label}
      </div>
      <div className={`mt-0.5 text-[12.5px] font-semibold ${tone}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[10.5px] leading-snug text-chalk-400">{sub}</div> : null}
    </div>
  );
}

/** Inline label + value pair for the assurance meta strip (supervisor, isolation). */
function MetaPair({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5" title={title}>
      <span className="text-chalk-400">{label}</span>
      <span className="font-medium text-chalk-300">{value}</span>
    </span>
  );
}

/** Why the orchestrator chose this Flow (only for selected runs). */

/** Where the run's work lives. Answers "how do I get into that git
 *  worktree?" - shows the worktree path + branch and a copy-able `cd` line.
 *  Read-only; the worktree is bounded to the run and never edited from here. */
function WorkspacePanel({
  worktreePath,
  branchName,
}: {
  worktreePath: string;
  branchName: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const cdLine = `cd ${/[^A-Za-z0-9_./-]/.test(worktreePath) ? `'${worktreePath.replace(/'/g, `'\\''`)}'` : worktreePath}`;
  const copy = () => {
    void navigator.clipboard?.writeText(cdLine).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-coal-500/60 text-chalk-300">
          <FolderTree className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-chalk-400">
            Workspace
          </div>
          <div className="truncate text-[12.5px] font-semibold text-chalk-100">
            {branchName ? <span className="mono">{branchName}</span> : "git worktree"}
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="h-7 shrink-0 rounded-[10px] border border-[color:var(--line-strong)] bg-coal-500 px-2.5 text-[11.5px] font-semibold text-chalk-100 transition hover:bg-coal-400"
          title="Copy a cd command for this run's git worktree"
        >
          {copied ? "copied" : "copy cd"}
        </button>
      </div>
      <div className="mt-2.5 rounded-[12px] bg-coal-500/40 px-3 py-2">
        <div className="mono truncate text-[12px] text-chalk-300" title={worktreePath}>
          {worktreePath}
        </div>
      </div>
      <div className="mt-1.5 text-[11px] text-chalk-400">
        The run's isolated git worktree. Run <span className="mono">vibe path</span> for the same from the CLI.
      </div>
    </div>
  );
}

/** Compact, evidence-backed run-assurance verdict. */
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
  const vm = VERDICT_META[a.verdict];
  const Icon = vm.icon;
  const actionCls =
    "h-7 rounded-[10px] border border-[color:var(--line-strong)] bg-coal-700 px-2.5 text-[11.5px] font-semibold text-chalk-100 transition hover:bg-coal-600";
  const hasMeta =
    (a.coverage?.toleratedStepFailures ?? 0) > 0 ||
    !!a.supervisor?.persona ||
    (!!a.isolation && a.isolation.posture !== "none");
  const isoBits = a.isolation
    ? [
        a.isolation.osSandboxedTurns > 0 ? `${a.isolation.osSandboxedTurns} OS-sandboxed` : null,
        a.isolation.hardenedTurns > 0 ? `${a.isolation.hardenedTurns} hardened` : null,
        a.isolation.unconfinedRequestedTurns > 0 ? `${a.isolation.unconfinedRequestedTurns} unconfined` : null,
      ].filter(Boolean)
    : [];
  return (
    <div className={`rounded-[18px] border px-4 py-3.5 ${vm.card}`} data-screen-label="01 Assurance">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-coal-500/60 ${vm.tone}`}>
          <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-chalk-400">
            Run assurance
          </div>
          <div className={`text-[15px] font-semibold ${vm.tone}`}>{a.verdict.replace(/_/g, " ")}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-chalk-300">{a.summary}</div>
        </div>
        {onViewReview || onViewValidation ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {onViewReview ? (
              <button type="button" onClick={onViewReview} className={actionCls}>
                View review
              </button>
            ) : null}
            {onViewReview && onRerunWithFixes ? (
              <button type="button" onClick={onRerunWithFixes} className={actionCls}>
                Re-run with fixes
              </button>
            ) : null}
            {onViewValidation ? (
              <button type="button" onClick={onViewValidation} className={actionCls}>
                View validation
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LaneCell label="Policy" value={a.policy.status.replace(/_/g, " ")} tone={laneTone(a.policy.status)} />
        <LaneCell
          label="Validation"
          value={`${a.validation.status.replace(/_/g, " ")}${a.validation.total > 0 ? ` ${a.validation.passed}/${a.validation.total}` : ""}`}
          sub={a.validation.status === "environment" ? "toolchain missing - nothing was checked" : undefined}
          tone={laneTone(a.validation.status)}
        />
        <LaneCell label="Review" value={a.review.status.replace(/_/g, " ")} tone={laneTone(a.review.status)} />
        <LaneCell label="Verification" value={a.verification.status.replace(/_/g, " ")} tone={laneTone(a.verification.status)} />
      </div>

      {hasMeta ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 rounded-[12px] bg-coal-500/40 px-3 py-2 text-[11px]">
          {(a.coverage?.toleratedStepFailures ?? 0) > 0 ? (
            <MetaPair
              label="Coverage"
              value={`${a.coverage.toleratedStepFailures} tolerated failure${a.coverage.toleratedStepFailures === 1 ? "" : "s"}`}
            />
          ) : null}
          {a.supervisor?.persona ? (
            <MetaPair
              label="Supervisor"
              value={`${a.supervisor.persona} (${a.supervisor.independence})`}
              title="The supervisor's review independence is honest, not a confidence source - single-profile is a same-model self-check that can only lower confidence."
            />
          ) : null}
          {a.isolation && a.isolation.posture !== "none" ? (
            <MetaPair
              label="Isolation"
              value={`${a.isolation.posture}${isoBits.length ? ` · ${isoBits.join(" · ")}` : ""}`}
              title="How confined the run's agents actually were, derived from per-turn provider evidence (not config). Informational - it never affects the verdict; the default is the worktree + diff gate."
            />
          ) : null}
        </div>
      ) : null}

      {a.blockers && a.blockers.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {a.blockers.map((b, i) => (
            <div key={i} className="rounded-[12px] border border-rose-400/25 bg-rose-500/[0.06] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-300">
                Cause{b.stepId ? ` · ${b.stepId}` : ""}{b.class ? ` · ${b.class}` : ""}
              </div>
              <div className="mt-0.5 text-[11.5px] text-chalk-300">{b.detail}</div>
            </div>
          ))}
        </div>
      ) : null}

      {(a.caps?.length ?? 0) > 0 || (a.notes?.length ?? 0) > 0 ? (
        <div className="mt-2 flex flex-col gap-1 text-[10.5px] text-chalk-400">
          {(a.caps?.length ?? 0) > 0 ? (
            <div>
              <span className="font-semibold">Caps</span> {a.caps.join(", ")}
            </div>
          ) : null}
          {(a.notes?.length ?? 0) > 0 ? (
            <div>
              <span className="font-semibold">Notes</span> {a.notes!.map(humanizeAssuranceNote).join(", ")}
            </div>
          ) : null}
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
