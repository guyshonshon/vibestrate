import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { navigate, type ReplayFocus } from "../App.js";
import type {
  AmacoEvent,
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
import { EventStream } from "../../components/workflow/EventStream.js";
import { ChangedFilesList } from "../../components/diff/ChangedFilesList.js";
import { ArtifactList } from "../../components/artifacts/ArtifactList.js";
import { ArtifactViewer } from "../../components/artifacts/ArtifactViewer.js";
import { ValidationSummary } from "../../components/validation/ValidationSummary.js";
import { ApprovalBanner } from "../../components/approvals/ApprovalBanner.js";
import { DiffViewer } from "../../components/diff/DiffViewer.js";
import { Bolt, Cpu, Scale } from "lucide-react";
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
  const [tab, setTab] = useState<InspectorV3Tab>(() =>
    initialTab === "artifact"
      ? "artifacts"
      : initialTab === "validation"
        ? "validation"
        : "events",
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
      />

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

      <CrewStrip guide={run.guide ?? null} />

      <section className="grid grid-cols-12 gap-5" data-screen-label="03 Live execution">
        <div className="col-span-12 xl:col-span-8 min-h-0">
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="eyebrow">3 · Live execution</span>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-black/55 overflow-hidden">
            <LiveOutputPanel runId={runId} status={run.status} />
          </div>
        </div>

        <aside className="col-span-12 xl:col-span-4 min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
          <ActiveAgentPanel run={run} metrics={metrics} />
          <DiffStatsPanel diff={diff} />
        </aside>
      </section>

      <StepTimelineV3 guide={run.guide ?? null} />

      <section data-screen-label="05 Inspector">
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="eyebrow">5 · Inspect</span>
          <InspectorTabsV3 current={tab} setCurrent={setTab} />
        </div>
        <div className="glass p-3.5">
          {tab === "events" ? (
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

function ActiveAgentPanel({
  run,
  metrics,
}: {
  run: RunState;
  metrics: RuntimeMetrics | null;
}) {
  const agent =
    metrics?.agents.find((a) => !a.endedAt) ?? metrics?.agents.slice(-1)[0] ?? null;
  const turn = agent?.toolCallCount ?? null;
  return (
    <div className="glass p-4">
      <SectionEyebrow className="mb-3">
        <span>Current agent</span>
        {turn !== null ? (
          <span className="mono text-[11px] text-fog-400 whitespace-nowrap">
            {turn} tool calls
          </span>
        ) : null}
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
            {agent?.guideSlotId ?? agent?.stageId ?? "—"}
          </div>
        </div>
        <Chip tone={run.status === "executing" ? "violet" : "neutral"}>
          <span className="pulse-dot" /> {run.status}
        </Chip>
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2 text-[12px]">
        <Stat label="Tool calls" value={String(agent?.toolCallCount ?? "—")} />
        <Stat
          label="Tokens"
          value={
            agent?.tokenUsage
              ? `${Math.round(
                  ((agent.tokenUsage.input ?? 0) +
                    (agent.tokenUsage.output ?? 0)) /
                    1000,
                )}k`
              : "—"
          }
        />
        <Stat
          label="Cost"
          value={
            metrics?.totalCostUsd !== null && metrics?.totalCostUsd !== undefined
              ? `$${metrics.totalCostUsd.toFixed(2)}`
              : "—"
          }
        />
        <Stat
          label="Skills"
          value={String(run.runtimeSkills?.length ?? agent?.skillsAttached.length ?? 0)}
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

function DiffStatsPanel({
  diff,
}: {
  diff: { insertions: number; deletions: number; files: number } | null;
}) {
  return (
    <div className="glass p-4">
      <SectionEyebrow className="mb-3">
        <span>Diff{diff ? ` · ${diff.files} files` : ""}</span>
        {diff ? (
          <span className="mono text-[11.5px] whitespace-nowrap">
            <span className="text-emerald-300/90">+{diff.insertions}</span>{" "}
            <span className="text-rose-300/90">−{diff.deletions}</span>
          </span>
        ) : null}
      </SectionEyebrow>
      {diff ? (
        <div className="text-[12px] text-fog-300">
          Worktree updates are summarized here. Open the Artifacts tab below
          for the full file list and diff viewer.
        </div>
      ) : (
        <div className="text-[12px] text-fog-400">
          No worktree diff yet. The diff fills in as the executor edits
          files.
        </div>
      )}
    </div>
  );
}

// Unused — kept so we can quickly add an inline "needs review" indicator
// later without re-importing icons.
void Bolt;
void Scale;
