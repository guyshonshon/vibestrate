import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type {
  AmacoEvent,
  RunState,
  RuntimeMetrics,
} from "../../lib/types.js";
import { RunHeader } from "../../components/runs/RunHeader.js";
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

export function RunDetailPage({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunState | null>(null);
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTabId>("diff");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [r, m] = await Promise.all([
          api.getRun(runId),
          api.getMetrics(runId).catch(() => null),
        ]);
        if (!cancelled) {
          setRun(r);
          setMetrics(m);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const interval = setInterval(load, 3000);
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

  function handleSelectFile(p: string) {
    setSelectedFile(p);
    setTab("diff");
  }
  function handleSelectArtifact(p: string) {
    setSelectedArtifact(p);
    setTab("artifact");
  }
  function handleSelectEvent(_e: AmacoEvent) {
    // Future: jump to artifact related to event. For now just keep current tab.
  }

  return (
    <div className="flex h-full flex-col">
      <RunHeader run={run} />
      <div className="grid flex-1 grid-cols-[1fr_440px] overflow-hidden">
        <section className="flex flex-col gap-3 overflow-y-auto p-4">
          <WorkflowTimeline status={run.status} />
          <ActiveAgentCard
            status={run.status}
            agents={metrics?.agents ?? []}
          />
          <ValidationSummary runId={runId} />
          <MetricsDashboard metrics={metrics} />
          <EventStream runId={runId} onSelect={handleSelectEvent} />
          <ChangedFilesListSection
            runId={runId}
            selectedFile={selectedFile}
            onSelect={handleSelectFile}
          />
        </section>
        <InspectorPanel activeTab={tab} onChangeTab={setTab}>
          {tab === "diff" ? (
            <DiffViewer runId={runId} filePath={selectedFile} />
          ) : tab === "artifact" ? (
            <div className="space-y-2">
              <ArtifactList
                runId={runId}
                selectedPath={selectedArtifact}
                onSelect={setSelectedArtifact}
              />
              <ArtifactViewer runId={runId} path={selectedArtifact} />
            </div>
          ) : tab === "validation" ? (
            <ValidationSummary runId={runId} />
          ) : tab === "logs" ? (
            <RuntimeLogPanel runId={runId} />
          ) : tab === "notes" ? (
            <NotesPanel runId={runId} />
          ) : tab === "skills" ? (
            <SkillsPanel />
          ) : (
            <MetricsDashboard metrics={metrics} />
          )}
        </InspectorPanel>
      </div>
    </div>
  );
}

function ChangedFilesListSection({
  runId,
  selectedFile,
  onSelect,
}: {
  runId: string;
  selectedFile: string | null;
  onSelect: (p: string) => void;
}) {
  return (
    <div className="rounded border border-amaco-border bg-amaco-panel p-3">
      <ChangedFilesList
        runId={runId}
        selectedPath={selectedFile}
        onSelect={onSelect}
      />
    </div>
  );
}
