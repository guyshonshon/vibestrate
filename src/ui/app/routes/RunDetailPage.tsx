// The run screen: one page holding everything a human needs to judge a single
// run - header and pause/abort controls, the supervisor's decisions and any
// pending approval, the terminal assurance verdict, a persisted panel board of
// live timeline / metrics / changed files / output, and the inspector (tree,
// steps, events, artifacts + diff, validation, terminal, replay).
//
// Where the data comes from, for anyone chasing a stale or doubly-fetched
// value: this page polls its own bundle every 2s (the effect keyed on runId +
// retryTick), but most panels it renders fetch independently on their own
// timers - the changed-files panel, for one, loads the same diff again. In the
// page's own bundle `api.getRun` is the sole unguarded call, so only a missing
// or broken run takes the page down; the rest go through `settle` and their
// failures are held in `panelErrors` (see lib/settled.ts). Assurance is
// fetched separately, only once the run reaches a terminal status, because
// that is when it is written.
//
// Below the page component: ActiveRolePanel (live metric tiles),
// RunOutcomeBanner (blocked/failed/aborted explanation + next actions),
// RerunDialog, WorkspacePanel (worktree path + copyable `cd`), AssuranceBadge
// (verdict + per-gate lanes). RerunDialog's only write is `api.spawnRun`: a
// rewind starts a NEW run with `resumeFrom` rather than touching the source
// run. Picking a reviewing/fixing/verifying rewind restores the source run's
// code snapshot into a fresh worktree, so the dialog runs a restore dry run
// first and blocks launch while it is loading or reports no snapshot - it does
// not block when that dry run itself fails.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  type ProviderRow,
  type RestorePreview,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { useConfirm } from "../../components/design/ConfirmDialog.js";
import { LoadingState } from "../../components/design/ErrorState.js";
import { PageShell } from "../../components/layout/PageShell.js";
import { Deck, Cell } from "../../components/layout/Deck.js";
import { ErrorView } from "../../lib/error-view.js";
import { settle, errorOf, valueOr } from "../../lib/settled.js";
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
import { isActiveStatus } from "../../lib/run-filter.js";
import { SupervisorControl } from "../../components/supervisor/SupervisorControl.js";
import {
  InspectorTabsV3,
  type InspectorV3Tab,
} from "../../components/runs/v3/InspectorTabs.js";
import { LazyTerminalPanel } from "../../components/terminal/LazyTerminalPanel.js";
import { LazyReplayPanel } from "../../components/replay/LazyReplayPanel.js";
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
import { StatTile } from "../../components/design/StatTile.js";
import { SegmentedControl } from "../../components/design/SegmentedControl.js";
import type { InspectorTabId } from "../../components/layout/inspector-tabs.js";
import { ActiveRolePanel } from "./run-detail/ActiveRolePanel.js";
import { AssuranceBadge } from "./run-detail/AssuranceBadge.js";
import { LaneCell } from "./run-detail/LaneCell.js";
import { RerunDialog } from "./run-detail/RerunDialog.js";
import { RunOutcomeBanner } from "./run-detail/RunOutcomeBanner.js";
import { WorkspacePanel } from "./run-detail/WorkspacePanel.js";

const POLL_MS = 2000;

// Deep links (?tab=...) speak the full InspectorTabId vocabulary, which is
// wider than the v3 inspector's own tab set - ids whose panels the v3 redesign
// retired (logs, notes, skills, ...) have no home here and fall back to Steps.
const V3_TAB_FOR_DEEP_LINK: Partial<Record<InspectorTabId, InspectorV3Tab>> = {
  artifact: "artifacts",
  // The v3 Artifacts tab absorbed the old standalone diff view, so `?tab=diff`
  // (Mission Control's "show run diff", and the documented deep link) resolves
  // there - with no artifact selected it opens on the changed-files list.
  diff: "artifacts",
  validation: "validation",
  events: "events",
  terminal: "terminal",
  replay: "replay",
};

export function RunDetailPage({
  runId,
  initialTab,
  replayFocus,
}: {
  runId: string;
  initialTab?: InspectorTabId | null;
  replayFocus?: ReplayFocus | null;
}) {
  const { confirm } = useConfirm();
  const [run, setRun] = useState<RunState | null>(null);
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [diff, setDiff] = useState<
    { insertions: number; deletions: number; files: number } | null
  >(null);
  const [error, setError] = useState<unknown>(null);
  // A secondary fetch may fail without taking the page down, but it must not
  // fail invisibly: the diff and the assurance verdict are exactly what a human
  // reviews before merging, and an empty panel would read as "nothing to
  // review" rather than "we could not load it". Keyed by panel so each renders
  // its own recovery. See lib/settled.ts.
  const [panelErrors, setPanelErrors] = useState<{
    diff?: unknown;
    assurance?: unknown;
    metrics?: unknown;
    approvals?: unknown;
    tree?: unknown;
    supervisor?: unknown;
    specUp?: unknown;
  }>({});
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
  const [tab, setTab] = useState<InspectorV3Tab>(
    () => (initialTab ? V3_TAB_FOR_DEEP_LINK[initialTab] : null) ?? "steps",
  );
  // A cross-link can re-route to the run page we're already on with a new
  // ?tab=... value. The page keys on runId alone, so it does NOT remount and
  // the initializer above never re-runs - without this the deep link silently
  // does nothing. Tab changes made here are not pushed back to the URL, so
  // this only fires when the route itself moves.
  useEffect(() => {
    if (!initialTab) return;
    const mapped = V3_TAB_FOR_DEEP_LINK[initialTab];
    if (mapped) setTab(mapped);
  }, [initialTab]);
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
  // Bumping this re-runs the load effect below, which is how manual Retry
  // re-triggers a load function defined inside the effect's closure.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadedOnce = false;
    const load = async () => {
      try {
        const [r, m, a, d, sel, eng, arb, aud, shp, cv] = await Promise.all([
          api.getRun(runId),
          settle(api.getMetrics(runId)),
          settle(api.listApprovals(runId)),
          settle(api.getDiff(runId)),
          settle(api.getRunSelection(runId)),
          settle(api.getRunEngagement(runId)),
          settle(api.getRunArbitration(runId)),
          settle(api.getRunAudit(runId)),
          settle(api.getSpecUpQuestions(runId)),
          settle(api.getChecklistVerdicts(runId)),
        ]);
        if (cancelled) return;
        loadedOnce = true;
        setRun(r);
        if (m.ok) setMetrics(m.value);
        setApprovals(valueOr(a, [] as ApprovalRequest[]));
        if (sel.ok) setSelection(sel.value);
        setEngagement(valueOr(eng, [] as EngagementEntry[]));
        if (arb.ok) setArbitration(arb.value);
        if (aud.ok) setAudit(aud.value);
        setChecklistVerdicts(valueOr(cv, [] as PerItemVerdict[]));
        if (shp.ok) {
          setSpecUpQuestions(shp.value?.questions ?? null);
          setSpecUpMeta(
            shp.value && shp.value.questions != null
              ? {
                  round: shp.value.round ?? 1,
                  coverageComplete: shp.value.coverageComplete ?? false,
                }
              : null,
          );
        }
        setPanelErrors((p) => ({
          ...p,
          metrics: errorOf(m),
          approvals: errorOf(a),
          // The tree is assembled from three fetches; any one of them failing
          // makes the rendered tree incomplete, so report the first failure
          // rather than showing a partial tree as if it were the whole run.
          tree: errorOf(aud) ?? errorOf(eng) ?? errorOf(cv),
          supervisor: errorOf(sel) ?? errorOf(arb),
          specUp: errorOf(shp),
        }));
        setError(null);
        // Assurance only exists once a run is terminal.
        if (["merge_ready", "blocked", "failed", "aborted"].includes(r.status)) {
          const as = await settle(api.getRunAssurance(runId));
          if (!cancelled) {
            if (as.ok) setAssurance(as.value);
            setPanelErrors((p) => ({ ...p, assurance: errorOf(as) }));
          }
        }
        if (d.ok) {
          setDiff(
            d.value
              ? {
                  insertions: d.value.totals.insertions,
                  deletions: d.value.totals.deletions,
                  files: d.value.totals.files,
                }
              : null,
          );
        }
        setPanelErrors((p) => ({ ...p, diff: errorOf(d) }));
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
  }, [runId, retryTick]);

  const pending = useMemo(
    () => approvals.find((a) => a.status === "pending") ?? null,
    [approvals],
  );
  const skillsCount = run?.runtimeSkills?.length ?? 0;

  if (error)
    return (
      <ErrorView
        err={error}
        actions={[
          { label: "Back to runs", onClick: () => navigate({ kind: "runs" }) },
          { label: "New run", onClick: () => navigate({ kind: "compose" }) },
          { label: "Mission control", onClick: () => navigate({ kind: "mission" }) },
        ]}
        onRetry={() => setRetryTick((t) => t + 1)}
      />
    );
  if (!run)
    return (
      <LoadingState
        title="Starting run"
        detail="Creating the worktree and launching the first step. This usually takes a few seconds."
      />
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
    if (
      !(await confirm({
        title: `Abort ${runId}?`,
        message: "This will stop the active agent.",
        confirmLabel: "Abort",
        danger: true,
      }))
    )
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
      <PageShell className="deep-scene relative z-10 mx-auto max-w-[1520px] flex flex-col gap-5">
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
      </PageShell>
    );
  }

  return (
    <PageShell className="deep-scene relative z-10 mx-auto max-w-[1520px] flex flex-col gap-5">
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

      {/* 1 - THE BRIEF is the page's hero: it answers "what is this run and
       * where is it" before anything else, so it leads. */}
      <RunStatusSection
        run={run}
        diff={diff}
        skillsCount={skillsCount}
        paused={paused || run.status === "paused"}
        onPauseToggle={() => void handlePauseToggle()}
        onAbort={() => void handleAbort()}
      />

      {/* A spec-up intake run whose questions fail to load falls through to the
       * ordinary run view, so the gap questions blocking the chain just are not
       * there. Say so rather than presenting an unblocked-looking run. */}
      {run.flow?.flowId === "spec-up-intake" && panelErrors.specUp ? (
        <ErrorView
          compact
          err={panelErrors.specUp}
          onRetry={() => setRetryTick((t) => t + 1)}
          override={{
            title: "Couldn't load this run's gap questions",
            hint: "This spec-up run may be waiting on your answers. Retry - without them the chain cannot move forward.",
          }}
        />
      ) : null}

      {/* A null diff renders as "no changes". When the fetch is what failed,
       * that is a lie about the one artifact a human is meant to review before
       * merging - so say so instead of showing a clean slate. */}
      {panelErrors.diff ? (
        <ErrorView
          compact
          err={panelErrors.diff}
          onRetry={() => setRetryTick((t) => t + 1)}
          override={{
            title: "Couldn't load this run's diff",
            hint: "The change summary above is unavailable, not empty. Retry before concluding the run changed nothing.",
          }}
        />
      ) : null}

      {/* 2 - THE SUPERVISOR frames everything below: who judges, what it
       * decided about this task, its live decision feed, and any approval
       * it is waiting on. */}
      <SupervisorPanel
        selection={selection}
        assurance={assurance}
        engagement={engagement}
        arbitration={arbitration}
      >
        {panelErrors.supervisor ? (
          <div className="mt-2">
            <ErrorView
              compact
              err={panelErrors.supervisor}
              onRetry={() => setRetryTick((t) => t + 1)}
              override={{
                title: "Couldn't load the supervisor's decisions",
                hint: "The workflow selection or arbitration record is unavailable. This panel is incomplete, not empty.",
              }}
            />
          </div>
        ) : null}
        {/* A swallowed approvals fetch hides the approval gate entirely, so the
         * run looks merely slow while it is actually waiting on this human. */}
        {panelErrors.approvals ? (
          <div className="mt-2">
            <ErrorView
              compact
              err={panelErrors.approvals}
              onRetry={() => setRetryTick((t) => t + 1)}
              override={{
                title: "Couldn't load approval requests",
                hint: "If this run is waiting on your approval, the request is not shown. Retry before assuming nothing needs you.",
              }}
            />
          </div>
        ) : null}
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
      ) : panelErrors.assurance ? (
        // The verdict EXISTS but we could not load it. Falling through to the
        // outcome banner alone would read as "assurance not written yet" - the
        // weaker claim - so say plainly that the evidence-backed verdict is
        // missing and offer the retry.
        <div className="flex flex-col gap-2">
          <ErrorView
            compact
            err={panelErrors.assurance}
            onRetry={() => setRetryTick((t) => t + 1)}
            override={{
              title: "Couldn't load the assurance verdict",
              hint: "The run's evidence-backed verdict is unavailable, so the summary below is the weaker outcome banner. Retry before treating this run as reviewed.",
            }}
          />
          <RunOutcomeBanner
            run={run}
            onRerun={() => setRerunOpen(true)}
            onOpenReview={() => setReviewOpen(true)}
            onOpenTab={(t) => setTab(t)}
          />
        </div>
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
          // The live timeline: replaces the run graph + seat board pair
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
            // Zeroed metrics are indistinguishable from "no work done yet", and
            // cost is one of them - say the number is missing, not zero.
            render: () =>
              panelErrors.metrics ? (
                <ErrorView
                  compact
                  err={panelErrors.metrics}
                  onRetry={() => setRetryTick((t) => t + 1)}
                  override={{
                    title: "Couldn't load live metrics",
                    hint: "Agent activity, provider calls and cost are unavailable, not zero.",
                  }}
                />
              ) : (
                <ActiveRolePanel run={run} metrics={metrics} />
              ),
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

      {/* The supervisor for THIS run, and only while it is live. Runs are
          genuinely concurrent (the scheduler cap only governs queue pickup), so
          a single global chat would leave "do it" without a referent. Once the
          run is terminal there is nothing to steer, and the thread stays
          readable in its history. */}
      {isActiveStatus(run.status) ? (
        <section data-screen-label="04b Supervisor">
          <SupervisorControl runId={runId} />
        </section>
      ) : null}

      <section data-screen-label="05 Inspector">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-violet-vivid">Inspect</h2>
          <InspectorTabsV3 current={tab} setCurrent={setTab} />
        </div>
        <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-3.5">
          {tab === "tree" ? (
            panelErrors.tree ? (
              <ErrorView
                compact
                err={panelErrors.tree}
                onRetry={() => setRetryTick((t) => t + 1)}
                override={{
                  title: "Couldn't load the run tree",
                  hint: "The audit trail, engagement feed or checklist verdicts failed to load, so the tree would be missing nodes rather than empty.",
                }}
              />
            ) : (
              <RunTree audit={audit} engagement={engagement} checklistVerdicts={checklistVerdicts} />
            )
          ) : tab === "steps" ? (
            panelErrors.metrics ? (
              <ErrorView
                compact
                err={panelErrors.metrics}
                onRetry={() => setRetryTick((t) => t + 1)}
                override={{
                  title: "Couldn't load step metrics",
                  hint: "The per-step breakdown is unavailable, not empty.",
                }}
              />
            ) : (
              <StepsInspector metrics={metrics} />
            )
          ) : tab === "events" ? (
            <EventStream runId={runId} />
          ) : tab === "artifacts" ? (
            <Deck>
              <Cell size="card">
                <ArtifactList
                  runId={runId}
                  selectedPath={selectedArtifact}
                  onSelect={setSelectedArtifact}
                />
              </Cell>
              <Cell size="wide" className="min-h-[200px]">
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
                      <SegmentedControl
                        value={fileViewMode}
                        onChange={(v) => setFileViewMode(v)}
                        options={[
                          { value: "diff", label: "Diff" },
                          { value: "file", label: "File" },
                        ]}
                      />
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
              </Cell>
            </Deck>
          ) : tab === "terminal" ? (
            <LazyTerminalPanel runId={runId} />
          ) : tab === "replay" ? (
            <LazyReplayPanel runId={runId} focus={replayFocus ?? null} />
          ) : (
            <ValidationSummary runId={runId} />
          )}
        </div>
      </section>
    </PageShell>
  );
}
