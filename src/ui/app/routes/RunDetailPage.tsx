import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type {
  AmacoEvent,
  ApprovalRequest,
  RunState,
  RuntimeMetrics,
} from "../../lib/types.js";
import { navigate, type ReplayFocus } from "../App.js";
import { RunHeader } from "../../components/runs/RunHeader.js";
import { RunControlPanel } from "../../components/runs/RunControlPanel.js";
import { LiveOutputPanel } from "../../components/runs/LiveOutputPanel.js";
import { AgentWorkPanel } from "../../components/runs/AgentWorkPanel.js";
import { WorkflowTimeline } from "../../components/workflow/WorkflowTimeline.js";
import { ActiveAgentCard } from "../../components/workflow/ActiveAgentCard.js";
import { EventStream } from "../../components/workflow/EventStream.js";
import { ChangedFilesList } from "../../components/diff/ChangedFilesList.js";
import { ValidationSummary } from "../../components/validation/ValidationSummary.js";
import { MetricsDashboard } from "../../components/metrics/MetricsDashboard.js";
import {
  InspectorPanel,
  type InspectorTabId,
} from "../../components/layout/InspectorPanel.js";
import { DiffViewer } from "../../components/diff/DiffViewer.js";
import { ArtifactList } from "../../components/artifacts/ArtifactList.js";
import { ArtifactViewer } from "../../components/artifacts/ArtifactViewer.js";
import { NotesPanel } from "../../components/notes/NotesPanel.js";
import { SkillsPanel } from "../../components/skills/SkillsPanel.js";
import { RuntimeLogPanel } from "../../components/logs/RuntimeLogPanel.js";
import { ApprovalBanner } from "../../components/approvals/ApprovalBanner.js";
import { ApprovalsList } from "../../components/approvals/ApprovalsList.js";
import { RunGitInspector } from "../../components/runs/RunGitInspector.js";
import { SuggestionsPanel } from "../../components/runs/SuggestionsPanel.js";
import { LazyTerminalPanel } from "../../components/terminal/LazyTerminalPanel.js";
import { LazyReplayPanel } from "../../components/replay/LazyReplayPanel.js";
import { FreshnessIndicator } from "../../components/codebase/FreshnessIndicator.js";
import { useCodebaseEvents } from "../../lib/useCodebaseEvents.js";

export function RunDetailPage({
  runId,
  initialTab,
  replayFocus,
}: {
  runId: string;
  initialTab?: InspectorTabId | null;
  replayFocus?: ReplayFocus | null;
}) {
  const [run, setRun] = useState<RunState | null>(null);
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTabId>(initialTab ?? "diff");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);

  // Cross-links can re-route to this same run page with a new ?tab=... value.
  // Because the runId hasn't changed, the component doesn't remount — so we
  // mirror initialTab into state on every change. We do NOT push tab changes
  // back to the URL; that would cause every click on the InspectorPanel to
  // mutate history.
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const freshness = useCodebaseEvents(
    `/api/runs/${encodeURIComponent(runId)}/codebase/events/stream`,
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [r, m, a] = await Promise.all([
          api.getRun(runId),
          api.getMetrics(runId).catch(() => null),
          api.listApprovals(runId).catch(() => [] as ApprovalRequest[]),
        ]);
        if (!cancelled) {
          setRun(r);
          setMetrics(m);
          setApprovals(a);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const interval = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId]);

  if (error)
    return <div className="px-6 py-8 text-amaco-fail">{error}</div>;
  if (!run)
    return (
      <div className="px-6 py-8 text-amaco-fg-muted">Loading run…</div>
    );

  const pending = approvals.find((a) => a.status === "pending") ?? null;

  function handleSelectFile(p: string) {
    setSelectedFile(p);
    setTab("diff");
  }
  function handleSelectEvent(_e: AmacoEvent) {
    // Future: jump to artifact related to event.
  }

  return (
    <div className="flex h-full flex-col">
      <RunHeader
        run={run}
        onRunUpdated={(next) => setRun(next)}
        onOpenCodebase={() =>
          navigate({ kind: "codebase", filePath: null, line: null, runId })
        }
        onOpenGit={() => navigate({ kind: "git", runId })}
        onOpenTask={(tid) => navigate({ kind: "task", taskId: tid })}
      />
      <div className="flex items-center justify-end gap-2 border-b border-amaco-border bg-amaco-panel/40 px-4 py-0.5">
        <FreshnessIndicator freshness={freshness} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {pending ? (
            <ApprovalBanner
              runId={runId}
              approval={pending}
              onResolved={(updated) => {
                setApprovals((prev) =>
                  prev.map((p) => (p.id === updated.id ? updated : p)),
                );
                setTab("approvals");
              }}
            />
          ) : null}
          {/* Main column is "what is happening right now": who's
           * running, what they're saying, where we are in the flow,
           * and the event log. Metrics / validation / changed files /
           * diff / artifacts all live in the bottom inspector drawer
           * so the main column stays focused on the live execution
           * story. Run control sits at the very bottom so it's
           * available without competing with status for the fold. */}
          <ActiveAgentCard
            status={run.status}
            agents={metrics?.agents ?? []}
          />
          <LiveOutputPanel runId={runId} />
          <WorkflowTimeline
            status={run.status}
            pausedAtStatus={run.approvalRequestedFromStatus ?? null}
          />
          <RunControlPanel runId={runId} status={run.status} />
        </section>
        <InspectorPanel activeTab={tab} onChangeTab={setTab}>
          {tab === "diff" ? (
            <div className="space-y-2">
              {/* Changed-files picker moved into the drawer alongside
               * the viewer — clicking a row updates the selected
               * file, which the viewer below renders. */}
              <div className="rounded border border-amaco-border bg-amaco-panel p-2">
                <ChangedFilesList
                  runId={runId}
                  selectedPath={selectedFile}
                  onSelect={handleSelectFile}
                />
              </div>
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
          ) : tab === "artifact" ? (
            <div className="space-y-2">
              <ArtifactList
                runId={runId}
                selectedPath={selectedArtifact}
                onSelect={setSelectedArtifact}
              />
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
            </div>
          ) : tab === "suggestions" ? (
            <SuggestionsPanel runId={runId} readOnly={run.readOnly ?? false} />
          ) : tab === "agent-work" ? (
            <AgentWorkPanel
              runId={runId}
              onOpenArtifact={(rel) => {
                // Artifact paths are relative to the run dir, e.g.
                // "artifacts/2_implement.md". The artifact list uses paths
                // relative to .amaco/runs/<id>/artifacts/, so strip that
                // prefix when present.
                const stripped = rel.replace(/^artifacts\//, "");
                setSelectedArtifact(stripped);
                setTab("artifact");
              }}
            />
          ) : tab === "git" ? (
            <RunGitInspector runId={runId} />
          ) : tab === "events" ? (
            <EventStream runId={runId} onSelect={handleSelectEvent} />
          ) : tab === "validation" ? (
            <ValidationSummary runId={runId} />
          ) : tab === "terminal" ? (
            <LazyTerminalPanel runId={runId} />
          ) : tab === "replay" ? (
            <LazyReplayPanel runId={runId} focus={replayFocus ?? null} />
          ) : tab === "logs" ? (
            <RuntimeLogPanel runId={runId} />
          ) : tab === "notes" ? (
            <NotesPanel runId={runId} />
          ) : tab === "skills" ? (
            <SkillsPanel />
          ) : tab === "approvals" ? (
            <ApprovalsList approvals={approvals} runId={runId} />
          ) : (
            <MetricsDashboard metrics={metrics} />
          )}
        </InspectorPanel>
      </div>
    </div>
  );
}

