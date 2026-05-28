import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, Search, X } from "lucide-react";
import { api } from "../../lib/api.js";
import type {
  ReplayEvent,
  ReplayPhase,
  ReplayPhaseKey,
  RunReplay,
} from "../../lib/types.js";
import { serializeRoute, type ReplayFocus } from "../../app/App.js";
import { filterReplayEvents } from "./replay-filter.js";

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
 *     fetches stdout/stderr because Vibestrate never persists those.
 *   - The eager TODO panels we link to are read-only too (artifact viewer,
 *     event row); this panel does not introduce any new write surface.
 *
 * Layout: left column is a scrubbable phase + event list, right column
 * is the detail for the selected row plus run-wide summaries.
 */
export function ReplayPanel({
  runId,
  focus,
}: {
  runId: string;
  focus?: ReplayFocus | null;
}) {
  const [replay, setReplay] = useState<RunReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ReplayPhaseKey>>(() => new Set());
  const [focusUnresolved, setFocusUnresolved] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Empty set === wildcard (see replay-filter.ts). The chips at the top
  // are additive — clicking one adds, clicking again removes.
  const [phaseFilter, setPhaseFilter] = useState<Set<ReplayPhaseKey>>(
    () => new Set(),
  );
  // Per-event-row refs so the resolver can scroll the matched row into view.
  // Map<eventIndex, HTMLLIElement>.
  const rowRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setReplay(null);
    setError(null);
    setSelectedIndex(null);
    setFocusUnresolved(null);
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

  // Resolve a deep-link focus once the replay projection has loaded — or
  // whenever the focus changes while we're already on this run. We expand
  // the phase containing the resolved event so the row is visible, and
  // imperatively scroll it into the viewport (selection alone is not enough
  // because the timeline can be hundreds of rows tall). A focus that
  // doesn't match any row surfaces a small banner — silent miss would be
  // confusing when the user just clicked "Open in Replay".
  useEffect(() => {
    if (!replay || !focus) return;
    const resolved = resolveFocus(focus, replay);
    if (resolved === null) {
      setFocusUnresolved(describeFocus(focus));
      return;
    }
    setFocusUnresolved(null);
    setSelectedIndex(resolved);
    const targetPhase = replay.events[resolved]?.phaseKey;
    if (targetPhase) {
      setCollapsed((prev) => {
        if (!prev.has(targetPhase)) return prev;
        const next = new Set(prev);
        next.delete(targetPhase);
        return next;
      });
    }
    // Defer the scroll one frame so the (possibly just-uncollapsed) phase
    // has rendered its rows and the ref is populated.
    const handle = window.requestAnimationFrame(() => {
      const node = rowRefs.current.get(resolved);
      if (node) {
        node.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
    return () => window.cancelAnimationFrame(handle);
  }, [replay, focus]);

  const selectedEvent = useMemo<ReplayEvent | null>(() => {
    if (!replay || selectedIndex === null) return null;
    return replay.events[selectedIndex] ?? null;
  }, [replay, selectedIndex]);

  // Set of event indices that pass the current filter. Empty filter →
  // every index is in the set. We pre-compute this so the render loop is
  // O(1) per row instead of re-running the substring match on every event
  // every render.
  const visibleIndices = useMemo<ReadonlySet<number>>(() => {
    if (!replay) return new Set();
    return new Set(
      filterReplayEvents(replay.events, { search, phases: phaseFilter }),
    );
  }, [replay, search, phaseFilter]);
  const filterActive = search.trim().length > 0 || phaseFilter.size > 0;

  // Visible indices in display order so keyboard navigation steps through
  // exactly what the user sees on the left column.
  const orderedVisible = useMemo<number[]>(() => {
    if (!replay) return [];
    const seen = new Set(visibleIndices);
    const out: number[] = [];
    for (const ev of replay.events) {
      if (seen.has(ev.index)) out.push(ev.index);
    }
    return out;
  }, [replay, visibleIndices]);

  // Keyboard scrubbing: ↑/k previous, ↓/j next, Home/End jump, when the
  // focus isn't already inside the search input. We attach to the document
  // because the panel itself doesn't own focus (the tab button does).
  useEffect(() => {
    if (orderedVisible.length === 0) return;
    function onKey(e: KeyboardEvent) {
      const target = document.activeElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let nextIdx: number | null = null;
      const curPos =
        selectedIndex !== null ? orderedVisible.indexOf(selectedIndex) : -1;
      if (e.key === "ArrowDown" || e.key === "j") {
        if (curPos < 0) nextIdx = orderedVisible[0]!;
        else if (curPos < orderedVisible.length - 1)
          nextIdx = orderedVisible[curPos + 1]!;
      } else if (e.key === "ArrowUp" || e.key === "k") {
        if (curPos < 0) nextIdx = orderedVisible[orderedVisible.length - 1]!;
        else if (curPos > 0) nextIdx = orderedVisible[curPos - 1]!;
      } else if (e.key === "Home") {
        nextIdx = orderedVisible[0]!;
      } else if (e.key === "End") {
        nextIdx = orderedVisible[orderedVisible.length - 1]!;
      }
      if (nextIdx === null) return;
      e.preventDefault();
      setSelectedIndex(nextIdx);
      // Mirror the focus-resolver behavior: scroll the newly-selected
      // row into view so a long timeline doesn't leave the user staring
      // at a stale viewport.
      const final = nextIdx;
      window.requestAnimationFrame(() => {
        const node = rowRefs.current.get(final);
        if (node) node.scrollIntoView({ block: "nearest" });
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [orderedVisible, selectedIndex]);

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
      <div className="rounded border border-vibestrate-fail/40 bg-vibestrate-fail/10 px-2 py-1 text-vibestrate-fail text-[11.5px]">
        {error}
      </div>
    );
  if (!replay)
    return (
      <div className="text-vibestrate-fg-muted text-[11.5px]">Loading replay…</div>
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
          <span className="font-medium text-vibestrate-fg">{replay.task || replay.runId}</span>
          <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
            {replay.finalStatus}
          </span>
          {replay.branchName ? (
            <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
              branch {replay.branchName}
            </span>
          ) : null}
          <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
            {replay.events.length} event(s)
          </span>
          {replay.flow ? (
            <span className="vibestrate-mono text-[10px] text-vibestrate-accent">
              flow {replay.flow.label}
              {currentReplayFlowStep(replay)
                ? ` · ${currentReplayFlowStep(replay)!.label} (${currentReplayFlowStep(replay)!.status})`
                : ""}
              {replay.flow.participants.length > 0
                ? ` · ${replay.flow.participants
                    .map(
                      (participant) =>
                        `${participant.slotId}:${participant.lastContextMode ?? "pending"}`,
                    )
                    .join(" ")}`
                : ""}
            </span>
          ) : null}
        </div>
        {replay.truncation.truncated ? (
          <div className="rounded border border-vibestrate-warn/40 bg-vibestrate-warn/10 px-2 py-1 text-[10.5px] text-vibestrate-warn">
            {replay.truncation.note}
          </div>
        ) : null}
        {focusUnresolved ? (
          <div className="rounded border border-vibestrate-warn/40 bg-vibestrate-warn/10 px-2 py-1 text-[10.5px] text-vibestrate-warn">
            Couldn't locate <span className="vibestrate-mono">{focusUnresolved}</span>{" "}
            in this run's timeline. The row may have been truncated, or the
            link points at a different run.
          </div>
        ) : null}
        {replay.missingOrMalformed.length > 0 ? (
          <details className="rounded border border-vibestrate-border bg-vibestrate-panel-2 px-2 py-1 text-[10.5px]">
            <summary className="cursor-pointer text-vibestrate-fg-muted">
              {replay.missingOrMalformed.length} file(s) skipped while building
              replay — click for details
            </summary>
            <ul className="mt-1 space-y-0.5 text-vibestrate-fg-muted">
              {replay.missingOrMalformed.map((m) => (
                <li key={m.file}>
                  <span className="vibestrate-mono">{m.file}</span>: {m.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </header>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        phaseFilter={phaseFilter}
        onTogglePhase={(key) =>
          setPhaseFilter((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onClear={() => {
          setSearch("");
          setPhaseFilter(new Set());
        }}
        phases={replay.phases}
        visibleCount={visibleIndices.size}
        totalCount={replay.events.length}
        active={filterActive}
      />

      <div className="grid flex-1 grid-cols-[200px_1fr] gap-2 overflow-hidden">
        {/* Left: phase + event timeline */}
        <aside className="overflow-y-auto rounded border border-vibestrate-border bg-vibestrate-panel-2 p-1.5 text-[10.5px]">
          {replay.phases
            .filter((p) =>
              p.eventIndices.some((i) => visibleIndices.has(i)),
            )
            .map((phase) => {
              const visibleInPhase = phase.eventIndices.filter((i) =>
                visibleIndices.has(i),
              );
              const isCollapsed = collapsed.has(phase.key);
              return (
                <div key={phase.key} className="mb-1.5">
                  <button
                    type="button"
                    onClick={() => togglePhase(phase.key)}
                    className="flex w-full items-baseline justify-between rounded px-1 py-0.5 text-left text-vibestrate-fg-dim hover:bg-vibestrate-panel"
                  >
                    <span className="font-medium uppercase tracking-[0.06em]">
                      {phase.label}
                    </span>
                    <span className="vibestrate-mono text-[9.5px] text-vibestrate-fg-muted">
                      {filterActive
                        ? `${visibleInPhase.length}/${phase.eventIndices.length}`
                        : phase.eventIndices.length}
                    </span>
                  </button>
                  {!isCollapsed ? (
                    <ul className="ml-1 mt-0.5 space-y-0.5">
                      {visibleInPhase.map((idx) => {
                        const ev = replay.events[idx]!;
                        const isSel = selectedIndex === idx;
                        return (
                          <li
                            key={idx}
                            ref={(node) => {
                              if (node) rowRefs.current.set(idx, node);
                              else rowRefs.current.delete(idx);
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedIndex(idx)}
                              className={`w-full truncate rounded px-1 py-0.5 text-left ${
                                isSel
                                  ? "bg-vibestrate-accent-soft/30 text-vibestrate-fg"
                                  : "text-vibestrate-fg-dim hover:bg-vibestrate-panel"
                              }`}
                              title={`${ev.timestamp} · ${ev.type}`}
                            >
                              <span className="vibestrate-mono text-[9.5px] text-vibestrate-fg-muted">
                                {formatShortTime(ev.timestamp)}
                              </span>{" "}
                              <span className="vibestrate-mono">{ev.type}</span>
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
            <div className="text-vibestrate-fg-muted">No events recorded.</div>
          ) : filterActive && visibleIndices.size === 0 ? (
            <div className="text-vibestrate-fg-muted">No events match the filter.</div>
          ) : null}
        </aside>

        {/* Right: detail + summaries */}
        <main className="space-y-2 overflow-y-auto pr-1">
          <SelectedEventCard
            runId={runId}
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

function currentReplayFlowStep(replay: RunReplay) {
  if (!replay.flow) return null;
  return (
    replay.flow.steps.find((step) => step.id === replay.flow?.currentStepId) ??
    null
  );
}

function SelectedEventCard({
  runId,
  event,
  snapshotAtSelected,
  phases,
}: {
  runId: string;
  event: ReplayEvent | null;
  snapshotAtSelected:
    | { status: string; previousStatus: string | null; sinceTimestamp: string }
    | null;
  phases: ReplayPhase[];
}) {
  if (!event) {
    return (
      <div className="rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2 text-vibestrate-fg-muted text-[11px]">
        Select an event from the timeline to see its detail.
      </div>
    );
  }
  const phaseLabel =
    phases.find((p) => p.key === event.phaseKey)?.label ?? event.phaseKey;
  return (
    <section className="rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2">
      <div className="flex items-center gap-2">
        <div className="vibestrate-mono flex-1 text-[10.5px] text-vibestrate-fg-muted">
          {event.timestamp} · {event.source === "synthetic" ? "synthetic" : "event"} ·{" "}
          {phaseLabel}
        </div>
        <CopyPermalinkButton runId={runId} eventIndex={event.index} />
      </div>
      <div className="vibestrate-mono mt-1 text-[12px] text-vibestrate-fg">{event.type}</div>
      <p className="mt-1 text-[11.5px] text-vibestrate-fg-dim">{event.message}</p>
      {snapshotAtSelected ? (
        <div className="vibestrate-mono mt-1 text-[10.5px] text-vibestrate-fg-muted">
          run state at this timestamp:{" "}
          <span className="text-vibestrate-fg">{snapshotAtSelected.status}</span>
          {snapshotAtSelected.previousStatus ? (
            <>
              {" "}
              <span className="text-vibestrate-fg-muted">
                (from {snapshotAtSelected.previousStatus})
              </span>
            </>
          ) : null}
          {" · since "}
          {formatShortTime(snapshotAtSelected.sinceTimestamp)}
        </div>
      ) : null}
      {event.artifactRefs.length > 0 ? (
        <div className="mt-1 text-[10.5px] text-vibestrate-fg-muted">
          referenced artifacts:{" "}
          {event.artifactRefs.map((a) => (
            <span key={a} className="vibestrate-mono mr-1">
              {a}
            </span>
          ))}
        </div>
      ) : null}
      {event.data ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10.5px] text-vibestrate-fg-muted">
            event data
          </summary>
          <pre className="vibestrate-mono mt-1 overflow-x-auto rounded bg-vibestrate-panel px-2 py-1 text-[10px] text-vibestrate-fg-dim">
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
              <li key={a.id} className="rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1">
                <div className="vibestrate-mono text-[10.5px] text-vibestrate-fg-dim">
                  {a.stageId} · {a.roleId} · risk {a.riskLevel} · source {a.source}
                </div>
                <div className="text-[11px]">
                  {a.status} {a.resolvedAt ? `· ${formatShortTime(a.resolvedAt)}` : ""}
                </div>
                {a.reason ? (
                  <div className="text-[10.5px] text-vibestrate-fg-muted">{a.reason}</div>
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
              <li key={s.id} className="rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1">
                <div className="text-[11px]">{s.title}</div>
                <div className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
                  {s.status} · {s.source}
                  {s.file ? ` · ${s.file}` : ""}
                  {s.validationProfile ? ` · profile ${s.validationProfile}` : ""}
                </div>
                {s.errorMessage ? (
                  <div className="text-[10.5px] text-vibestrate-fail">{s.errorMessage}</div>
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
              <li key={b.id} className="rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1">
                <div className="text-[11px]">{b.title}</div>
                <div className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
                  {b.status} · {b.suggestionIds.length} suggestion(s)
                  {b.validationProfile ? ` · profile ${b.validationProfile}` : ""}
                </div>
                {b.errorMessage ? (
                  <div className="text-[10.5px] text-vibestrate-fail">{b.errorMessage}</div>
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
                className="rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1"
              >
                <div className="vibestrate-mono text-[10.5px] text-vibestrate-warn">
                  {p.surface} · rule {p.ruleId}
                </div>
                <div className="text-[10.5px] text-vibestrate-fg-dim">{p.message}</div>
                <div className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
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
              <li key={n.id} className="rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1">
                <div className="text-[11px]">{n.title}</div>
                <div className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
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
              <li key={s.id} className="rounded border border-vibestrate-border bg-vibestrate-panel px-2 py-1">
                <div className="vibestrate-mono text-[10.5px] text-vibestrate-fg-dim">{s.id}</div>
                <div className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                  {s.shell} · {s.cwd}
                </div>
                <div className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
                  opened {formatShortTime(s.createdAt)}
                  {s.closedAt
                    ? ` · closed ${formatShortTime(s.closedAt)} · exit ${s.exitCode ?? "?"}`
                    : " · still live"}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[10px] text-vibestrate-fg-muted">
          Terminal output (stdout/stderr) is never persisted by Vibestrate, so replay
          cannot show it. Only session lifecycle metadata is available.
        </p>
      </SummaryCard>

      {replay.metrics ? (
        <SummaryCard title="Metrics" count={null}>
          <ul className="vibestrate-mono space-y-0.5 text-[10.5px] text-vibestrate-fg-dim">
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
              agent stage order: {replay.metrics.roleStageOrder.join(" → ") || "—"}
            </li>
          </ul>
        </SummaryCard>
      ) : null}

      <SummaryCard title="Artifacts" count={replay.artifacts.length}>
        {replay.artifacts.length === 0 ? (
          <Empty />
        ) : (
          <ul className="vibestrate-mono space-y-0.5 text-[10.5px] text-vibestrate-fg-dim">
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
    <section className="rounded border border-vibestrate-border bg-vibestrate-panel-2 p-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.1em] text-vibestrate-fg-muted">
          {title}
        </h3>
        {count !== null ? (
          <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
            {count}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px]">{children}</div>
    </section>
  );
}

function Empty() {
  return <div className="text-vibestrate-fg-muted text-[10.5px]">None.</div>;
}

function CopyPermalinkButton({
  runId,
  eventIndex,
}: {
  runId: string;
  eventIndex: number;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    // Serialize through the same helper the router uses, so the URL we
    // emit always round-trips back to this exact event selection.
    const hash = serializeRoute({
      kind: "run",
      runId,
      tab: "replay",
      replayFocus: { kind: "event", eventIndex },
    });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / restricted contexts (file://, missing user
      // gesture) can refuse the Clipboard API. Fall back to opening the
      // URL in the location bar so the user can copy it manually — no
      // silent failure.
      window.prompt("Copy this link:", url);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:bg-vibestrate-panel-2"
      title="Copy a permalink to this event"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-vibestrate-success" strokeWidth={1.5} />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Link2 className="h-3 w-3" strokeWidth={1.5} />
          <span>Permalink</span>
        </>
      )}
    </button>
  );
}

function FilterBar({
  search,
  onSearchChange,
  phaseFilter,
  onTogglePhase,
  onClear,
  phases,
  visibleCount,
  totalCount,
  active,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  phaseFilter: ReadonlySet<ReplayPhaseKey>;
  onTogglePhase: (key: ReplayPhaseKey) => void;
  onClear: () => void;
  phases: ReplayPhase[];
  visibleCount: number;
  totalCount: number;
  active: boolean;
}) {
  const nonEmpty = phases.filter((p) => p.eventIndices.length > 0);
  return (
    <div className="space-y-1 rounded border border-vibestrate-border bg-vibestrate-panel-2 p-1.5">
      <div className="flex items-center gap-1.5">
        <Search
          className="h-3 w-3 shrink-0 text-vibestrate-fg-muted"
          strokeWidth={1.5}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter events by type or message…"
          className="vibestrate-mono flex-1 rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-0.5 text-[11px] text-vibestrate-fg placeholder:text-vibestrate-fg-muted focus:border-vibestrate-accent/60 focus:outline-none"
        />
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded border border-vibestrate-border bg-vibestrate-panel px-1.5 py-0.5 text-[10.5px] text-vibestrate-fg-dim hover:bg-vibestrate-panel-2"
            title="Clear filter"
          >
            <X className="h-3 w-3" strokeWidth={1.5} />
            Clear
          </button>
        ) : null}
        <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
          {active ? `${visibleCount}/${totalCount}` : `${totalCount}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {nonEmpty.map((p) => {
          const on = phaseFilter.has(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onTogglePhase(p.key)}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                on
                  ? "border-vibestrate-accent/60 bg-vibestrate-accent-soft/30 text-vibestrate-fg"
                  : "border-vibestrate-border bg-vibestrate-panel text-vibestrate-fg-dim hover:bg-vibestrate-panel-2"
              }`}
              title={`${on ? "Hide" : "Show only"} ${p.label} events`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatShortTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

/**
 * Map a ReplayFocus onto a concrete event index in the loaded projection.
 * Returns null when the focus has no match in this run (e.g. the deep-link
 * was authored against a different run, or the referenced row was beyond
 * the 10 000-event projection cap).
 */
function resolveFocus(focus: ReplayFocus, replay: RunReplay): number | null {
  if (focus.kind === "event") {
    const ev = replay.events[focus.eventIndex];
    return ev ? ev.index : null;
  }
  if (focus.kind === "phase") {
    const phase = replay.phases.find((p) => p.key === focus.phase);
    const first = phase?.eventIndices[0];
    return typeof first === "number" ? first : null;
  }
  // kind === "match": search projection events for the originating row.
  // Suggestion events carry data.id; approval events carry data.approvalId;
  // synthetic notification events carry data.id (added in run-replay-service).
  const targetId = focus.match.id;
  const want = focus.match.kind;
  for (const ev of replay.events) {
    const data = ev.data;
    if (!data) continue;
    if (
      want === "suggestion" &&
      (ev.type.startsWith("suggestion.") || ev.type.startsWith("bundle.")) &&
      readString(data, "id") === targetId
    ) {
      return ev.index;
    }
    if (
      want === "approval" &&
      ev.type.startsWith("approval.") &&
      readString(data, "approvalId") === targetId
    ) {
      return ev.index;
    }
    if (
      want === "notification" &&
      ev.type === "notification.created" &&
      readString(data, "id") === targetId
    ) {
      return ev.index;
    }
  }
  return null;
}

function readString(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return typeof v === "string" ? v : null;
}

function describeFocus(focus: ReplayFocus): string {
  switch (focus.kind) {
    case "event":
      return `event #${focus.eventIndex}`;
    case "phase":
      return `phase ${focus.phase}`;
    case "match":
      return `${focus.match.kind} ${focus.match.id}`;
  }
}
