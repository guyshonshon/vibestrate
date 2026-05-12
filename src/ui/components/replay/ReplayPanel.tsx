import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import type {
  ReplayEvent,
  ReplayPhase,
  ReplayPhaseKey,
  RunReplay,
} from "../../lib/types.js";

/**
 * Read-only Replay panel.
 *
 * Hard rules — this surface NEVER mutates anything:
 *   - No "apply suggestion", "run validation", "approve", "abort", etc.
 *     buttons. The panel only renders what's already on disk.
 *   - No re-execution path. There is no "step forward" that re-runs an
 *     agent or invokes a provider.
 *   - No terminal transcript. Terminal session entries surface metadata
 *     only (id, cwd, createdAt, closedAt, exitCode); the panel never
 *     fetches stdout/stderr because Amaco never persists those.
 *   - The eager TODO panels we link to are read-only too (artifact viewer,
 *     event row); this panel does not introduce any new write surface.
 *
 * Layout: left column is a scrubbable phase + event list, right column
 * is the detail for the selected row plus run-wide summaries.
 */
export function ReplayPanel({ runId }: { runId: string }) {
  const [replay, setReplay] = useState<RunReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ReplayPhaseKey>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setReplay(null);
    setError(null);
    setSelectedIndex(null);
    api
      .getRunReplay(runId)
      .then((r) => {
        if (cancelled) return;
        setReplay(r);
        // Default selection: the most recent event (so the user lands on
        // the run's tail state instead of a long scroll back).
        if (r.events.length > 0) {
          setSelectedIndex(r.events[r.events.length - 1]!.index);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const selectedEvent = useMemo<ReplayEvent | null>(() => {
    if (!replay || selectedIndex === null) return null;
    return replay.events[selectedIndex] ?? null;
  }, [replay, selectedIndex]);

  const snapshotAtSelected = useMemo<{
    status: string;
    previousStatus: string | null;
    sinceTimestamp: string;
  } | null>(() => {
    if (!replay || !selectedEvent) return null;
    const sel = selectedEvent.timestamp;
    let best: { status: string; previousStatus: string | null; ts: string } | null = null;
    for (const s of replay.snapshots) {
      if (s.timestamp <= sel) {
        if (!best || s.timestamp >= best.ts) {
          best = { status: s.status, previousStatus: s.previousStatus, ts: s.timestamp };
        }
      }
    }
    if (!best) return null;
    return {
      status: best.status,
      previousStatus: best.previousStatus,
      sinceTimestamp: best.ts,
    };
  }, [replay, selectedEvent]);

  if (error)
    return (
      <div className="rounded border border-amaco-fail/40 bg-amaco-fail/10 px-2 py-1 text-amaco-fail text-[11.5px]">
        {error}
      </div>
    );
  if (!replay)
    return (
      <div className="text-amaco-fg-muted text-[11.5px]">Loading replay…</div>
    );

  function togglePhase(key: ReplayPhaseKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col gap-2 text-[12px]">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2 text-[11.5px]">
          <span className="font-medium text-amaco-fg">{replay.task || replay.runId}</span>
          <span className="amaco-mono text-[10px] text-amaco-fg-muted">
            {replay.finalStatus}
          </span>
          {replay.branchName ? (
            <span className="amaco-mono text-[10px] text-amaco-fg-muted">
              branch {replay.branchName}
            </span>
          ) : null}
          <span className="amaco-mono text-[10px] text-amaco-fg-muted">
            {replay.events.length} event(s)
          </span>
        </div>
        {replay.truncation.truncated ? (
          <div className="rounded border border-amaco-warn/40 bg-amaco-warn/10 px-2 py-1 text-[10.5px] text-amaco-warn">
            {replay.truncation.note}
          </div>
        ) : null}
        {replay.missingOrMalformed.length > 0 ? (
          <details className="rounded border border-amaco-border bg-amaco-panel-2 px-2 py-1 text-[10.5px]">
            <summary className="cursor-pointer text-amaco-fg-muted">
              {replay.missingOrMalformed.length} file(s) skipped while building
              replay — click for details
            </summary>
            <ul className="mt-1 space-y-0.5 text-amaco-fg-muted">
              {replay.missingOrMalformed.map((m) => (
                <li key={m.file}>
                  <span className="amaco-mono">{m.file}</span>: {m.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </header>

      <div className="grid flex-1 grid-cols-[200px_1fr] gap-2 overflow-hidden">
        {/* Left: phase + event timeline */}
        <aside className="overflow-y-auto rounded border border-amaco-border bg-amaco-panel-2 p-1.5 text-[10.5px]">
          {replay.phases
            .filter((p) => p.eventIndices.length > 0)
            .map((phase) => {
              const isCollapsed = collapsed.has(phase.key);
              return (
                <div key={phase.key} className="mb-1.5">
                  <button
                    type="button"
                    onClick={() => togglePhase(phase.key)}
                    className="flex w-full items-baseline justify-between rounded px-1 py-0.5 text-left text-amaco-fg-dim hover:bg-amaco-panel"
                  >
                    <span className="font-medium uppercase tracking-[0.06em]">
                      {phase.label}
                    </span>
                    <span className="amaco-mono text-[9.5px] text-amaco-fg-muted">
                      {phase.eventIndices.length}
                    </span>
                  </button>
                  {!isCollapsed ? (
                    <ul className="ml-1 mt-0.5 space-y-0.5">
                      {phase.eventIndices.map((idx) => {
                        const ev = replay.events[idx]!;
                        const isSel = selectedIndex === idx;
                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              onClick={() => setSelectedIndex(idx)}
                              className={`w-full truncate rounded px-1 py-0.5 text-left ${
                                isSel
                                  ? "bg-amaco-accent-soft/30 text-amaco-fg"
                                  : "text-amaco-fg-dim hover:bg-amaco-panel"
                              }`}
                              title={`${ev.timestamp} · ${ev.type}`}
                            >
                              <span className="amaco-mono text-[9.5px] text-amaco-fg-muted">
                                {formatShortTime(ev.timestamp)}
                              </span>{" "}
                              <span className="amaco-mono">{ev.type}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          {replay.events.length === 0 ? (
            <div className="text-amaco-fg-muted">No events recorded.</div>
          ) : null}
        </aside>

        {/* Right: detail + summaries */}
        <main className="space-y-2 overflow-y-auto pr-1">
          <SelectedEventCard
            event={selectedEvent}
            snapshotAtSelected={snapshotAtSelected}
            phases={replay.phases}
          />
          <SummaryCards replay={replay} />
        </main>
      </div>
    </div>
  );
}

function SelectedEventCard({
  event,
  snapshotAtSelected,
  phases,
}: {
  event: ReplayEvent | null;
  snapshotAtSelected:
    | { status: string; previousStatus: string | null; sinceTimestamp: string }
    | null;
  phases: ReplayPhase[];
}) {
  if (!event) {
    return (
      <div className="rounded border border-amaco-border bg-amaco-panel-2 p-2 text-amaco-fg-muted text-[11px]">
        Select an event from the timeline to see its detail.
      </div>
    );
  }
  const phaseLabel =
    phases.find((p) => p.key === event.phaseKey)?.label ?? event.phaseKey;
  return (
    <section className="rounded border border-amaco-border bg-amaco-panel-2 p-2">
      <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
        {event.timestamp} · {event.source === "synthetic" ? "synthetic" : "event"} ·{" "}
        {phaseLabel}
      </div>
      <div className="amaco-mono mt-1 text-[12px] text-amaco-fg">{event.type}</div>
      <p className="mt-1 text-[11.5px] text-amaco-fg-dim">{event.message}</p>
      {snapshotAtSelected ? (
        <div className="amaco-mono mt-1 text-[10.5px] text-amaco-fg-muted">
          run state at this timestamp:{" "}
          <span className="text-amaco-fg">{snapshotAtSelected.status}</span>
          {snapshotAtSelected.previousStatus ? (
            <>
              {" "}
              <span className="text-amaco-fg-muted">
                (from {snapshotAtSelected.previousStatus})
              </span>
            </>
          ) : null}
          {" · since "}
          {formatShortTime(snapshotAtSelected.sinceTimestamp)}
        </div>
      ) : null}
      {event.artifactRefs.length > 0 ? (
        <div className="mt-1 text-[10.5px] text-amaco-fg-muted">
          referenced artifacts:{" "}
          {event.artifactRefs.map((a) => (
            <span key={a} className="amaco-mono mr-1">
              {a}
            </span>
          ))}
        </div>
      ) : null}
      {event.data ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10.5px] text-amaco-fg-muted">
            event data
          </summary>
          <pre className="amaco-mono mt-1 overflow-x-auto rounded bg-amaco-panel px-2 py-1 text-[10px] text-amaco-fg-dim">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}

function SummaryCards({ replay }: { replay: RunReplay }) {
  return (
    <>
      <SummaryCard title="Approvals" count={replay.approvals.length}>
        {replay.approvals.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {replay.approvals.map((a) => (
              <li key={a.id} className="rounded border border-amaco-border bg-amaco-panel px-2 py-1">
                <div className="amaco-mono text-[10.5px] text-amaco-fg-dim">
                  {a.stageId} · {a.agentId} · risk {a.riskLevel} · source {a.source}
                </div>
                <div className="text-[11px]">
                  {a.status} {a.resolvedAt ? `· ${formatShortTime(a.resolvedAt)}` : ""}
                </div>
                {a.reason ? (
                  <div className="text-[10.5px] text-amaco-fg-muted">{a.reason}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      <SummaryCard title="Suggestions" count={replay.suggestions.length}>
        {replay.suggestions.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {replay.suggestions.map((s) => (
              <li key={s.id} className="rounded border border-amaco-border bg-amaco-panel px-2 py-1">
                <div className="text-[11px]">{s.title}</div>
                <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                  {s.status} · {s.source}
                  {s.file ? ` · ${s.file}` : ""}
                  {s.validationProfile ? ` · profile ${s.validationProfile}` : ""}
                </div>
                {s.errorMessage ? (
                  <div className="text-[10.5px] text-amaco-fail">{s.errorMessage}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      <SummaryCard title="Bundles" count={replay.bundles.length}>
        {replay.bundles.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {replay.bundles.map((b) => (
              <li key={b.id} className="rounded border border-amaco-border bg-amaco-panel px-2 py-1">
                <div className="text-[11px]">{b.title}</div>
                <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                  {b.status} · {b.suggestionIds.length} suggestion(s)
                  {b.validationProfile ? ` · profile ${b.validationProfile}` : ""}
                </div>
                {b.errorMessage ? (
                  <div className="text-[10.5px] text-amaco-fail">{b.errorMessage}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      <SummaryCard
        title="Policy refusals"
        count={replay.policyRefusals.length}
      >
        {replay.policyRefusals.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {replay.policyRefusals.map((p, i) => (
              <li
                key={`${p.timestamp}-${i}`}
                className="rounded border border-amaco-border bg-amaco-panel px-2 py-1"
              >
                <div className="amaco-mono text-[10.5px] text-amaco-warn">
                  {p.surface} · rule {p.ruleId}
                </div>
                <div className="text-[10.5px] text-amaco-fg-dim">{p.message}</div>
                <div className="amaco-mono text-[10px] text-amaco-fg-muted">
                  {p.timestamp}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      <SummaryCard title="Notifications" count={replay.notifications.length}>
        {replay.notifications.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {replay.notifications.map((n) => (
              <li key={n.id} className="rounded border border-amaco-border bg-amaco-panel px-2 py-1">
                <div className="text-[11px]">{n.title}</div>
                <div className="amaco-mono text-[10.5px] text-amaco-fg-muted">
                  {n.severity} · {n.category} · {formatShortTime(n.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      <SummaryCard
        title="Terminal sessions (metadata only)"
        count={replay.terminalSessions.length}
      >
        {replay.terminalSessions.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {replay.terminalSessions.map((s) => (
              <li key={s.id} className="rounded border border-amaco-border bg-amaco-panel px-2 py-1">
                <div className="amaco-mono text-[10.5px] text-amaco-fg-dim">{s.id}</div>
                <div className="amaco-mono text-[10px] text-amaco-fg-muted">
                  {s.shell} · {s.cwd}
                </div>
                <div className="amaco-mono text-[10px] text-amaco-fg-muted">
                  opened {formatShortTime(s.createdAt)}
                  {s.closedAt
                    ? ` · closed ${formatShortTime(s.closedAt)} · exit ${s.exitCode ?? "?"}`
                    : " · still live"}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[10px] text-amaco-fg-muted">
          Terminal output (stdout/stderr) is never persisted by Amaco, so replay
          cannot show it. Only session lifecycle metadata is available.
        </p>
      </SummaryCard>

      {replay.metrics ? (
        <SummaryCard title="Metrics" count={null}>
          <ul className="amaco-mono space-y-0.5 text-[10.5px] text-amaco-fg-dim">
            <li>duration: {replay.metrics.totalDurationMs} ms</li>
            <li>provider calls: {replay.metrics.totalProviderCalls}</li>
            <li>review loops: {replay.metrics.reviewLoopCount}</li>
            {replay.metrics.totalCostUsd !== null ? (
              <li>cost: ${replay.metrics.totalCostUsd.toFixed(4)}</li>
            ) : null}
            {replay.metrics.filesChanged !== null ? (
              <li>
                files changed: {replay.metrics.filesChanged} (+
                {replay.metrics.diffInsertions ?? 0} / -
                {replay.metrics.diffDeletions ?? 0})
              </li>
            ) : null}
            <li>
              agent stage order: {replay.metrics.agentStageOrder.join(" → ") || "—"}
            </li>
          </ul>
        </SummaryCard>
      ) : null}

      <SummaryCard title="Artifacts" count={replay.artifacts.length}>
        {replay.artifacts.length === 0 ? (
          <Empty />
        ) : (
          <ul className="amaco-mono space-y-0.5 text-[10.5px] text-amaco-fg-dim">
            {replay.artifacts.map((a) => (
              <li key={a.path}>{a.path}</li>
            ))}
          </ul>
        )}
      </SummaryCard>
    </>
  );
}

function SummaryCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-amaco-border bg-amaco-panel-2 p-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.1em] text-amaco-fg-muted">
          {title}
        </h3>
        {count !== null ? (
          <span className="amaco-mono text-[10px] text-amaco-fg-muted">
            {count}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px]">{children}</div>
    </section>
  );
}

function Empty() {
  return <div className="text-amaco-fg-muted text-[10.5px]">None.</div>;
}

function formatShortTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  } catch {
    return ts;
  }
}
