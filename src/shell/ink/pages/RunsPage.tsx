import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { ShellSnapshot, ShellRunRow } from "../../shell-snapshot.js";
import {
  RUN_INSPECTOR_TABS,
  type RunInspectorTab,
  type ShellUiStateV2,
} from "../ui-state.js";
import { filterEvents } from "../event-filter.js";
import { CARD_PROPS, FOCAL_CARD_PROPS, clip, eventTypeColor, runStatusToken, timeAgo } from "../theme.js";
import { SelectionMark, StatusPill } from "../components/visuals.js";
import { useTerminalWidth } from "../hooks/useTerminalWidth.js";
import { useRunAudit } from "../hooks/useRunAudit.js";
import type { RunAudit, AuditStep } from "../../../core/run/run-audit.js";

type Props = {
  snapshot: ShellSnapshot;
  ui: ShellUiStateV2;
  onFilterChange: (q: string) => void;
  onFilterSubmit: () => void;
};

const TAB_LABELS: Record<RunInspectorTab, string> = {
  overview: "Overview",
  events: "Events",
  validation: "Validation",
  audit: "Audit",
};
const TAB_KEYS: Record<RunInspectorTab, string> = {
  overview: "o",
  events: "e",
  validation: "v",
  audit: "u",
};

export function RunsPage({
  snapshot,
  ui,
  onFilterChange,
  onFilterSubmit,
}: Props) {
  const runs = snapshot.runs;
  const selectedIndex = ui.selection.runs ?? 0;
  const selected = runs[selectedIndex] ?? null;
  const cols = useTerminalWidth();
  const stacked = cols < 100;
  return (
    <Box flexDirection="column">
      <SchedulerQueueStrip snapshot={snapshot} />
      <Box flexDirection={stacked ? "column" : "row"} gap={1}>
        <Box flexBasis={0} flexGrow={stacked ? 0 : 2}>
          <RunsList runs={runs} selectedIndex={selectedIndex} />
        </Box>
        <Box flexBasis={0} flexGrow={stacked ? 0 : 3}>
          <InspectorCard
            snapshot={snapshot}
            row={selected}
            tab={ui.runs.inspectorTab}
            eventFilter={ui.runs.eventFilter}
            eventFilterOpen={ui.runs.eventFilterOpen}
            onFilterChange={onFilterChange}
            onFilterSubmit={onFilterSubmit}
          />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Compact scheduler + queue summary, folded in from the old Queue tab so
 * queued and running work read in one place. Read-only here: the scheduler
 * controls (pause/resume/start/policy) live in the `:` command palette and the
 * `vibe queue` CLI.
 */
function SchedulerQueueStrip({ snapshot }: { snapshot: ShellSnapshot }) {
  const sched = snapshot.scheduler;
  const queue = snapshot.queue;
  const running = sched?.runningTaskIds ?? [];
  if (!sched && queue.length === 0 && running.length === 0) return null;
  const stateColor = !sched ? "red" : sched.paused ? "yellow" : "cyan";
  const stateLabel = !sched ? "offline" : sched.paused ? "paused" : "running";
  return (
    <Box {...CARD_PROPS} flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={stateColor}>▌ </Text>
        <Text bold color={stateColor}>
          scheduler {stateLabel}
        </Text>
        {sched ? (
          <Text dimColor>
            {"   "}policy {sched.queuePolicy} · max {sched.maxConcurrentRuns}
          </Text>
        ) : null}
        <Text dimColor>
          {"   "}queued {queue.length} · running {running.length}
        </Text>
      </Text>
      {queue.length > 0 ? (
        <Text dimColor wrap="truncate-end">
          {"  queued: "}
          {queue
            .slice(0, 6)
            .map((e) => e.taskId)
            .join("  ·  ")}
          {queue.length > 6 ? `  + ${queue.length - 6} more` : ""}
        </Text>
      ) : null}
      {running.length > 0 ? (
        <Text wrap="truncate-end">
          <Text dimColor>{"  running: "}</Text>
          <Text color="magenta">{running.slice(0, 6).join("  ")}</Text>
        </Text>
      ) : null}
      <Text dimColor>
        {"  queue actions: "}
        <Text color="cyan">:</Text>
        {" palette or "}
        <Text color="cyan">vibe queue</Text>
      </Text>
    </Box>
  );
}

function RunsList({
  runs,
  selectedIndex,
}: {
  runs: ShellRunRow[];
  selectedIndex: number;
}) {
  return (
    <Box {...CARD_PROPS} flexDirection="column">
      <Text dimColor>runs   ({runs.length})</Text>
      <Box marginTop={1} flexDirection="column">
        {runs.length === 0 ? <EmptyRunsWalkthrough /> : (
          runs.slice(0, 14).map((r, i) => (
            <RunRow key={r.runId} row={r} selected={i === selectedIndex} />
          ))
        )}
      </Box>
    </Box>
  );
}

function RunRow({ row, selected }: { row: ShellRunRow; selected: boolean }) {
  const tok = runStatusToken(row.status);
  return (
    <Box>
      <SelectionMark selected={selected} />
      <Text>
        <Text color={tok.color}>{tok.glyph}</Text>
        <Text bold={selected}>  {clip(row.displayName || row.task, 30).padEnd(30)}</Text>
        <Text dimColor>
          {"  "}
          {clip(row.flow?.currentStepLabel ?? row.currentRole ?? "-", 10).padEnd(10)}
        </Text>
        <Text dimColor>  {timeAgo(row.updatedAt).padStart(6)}</Text>
        {row.pendingApprovals > 0 ? (
          <Text color="yellow">  ⏳{row.pendingApprovals}</Text>
        ) : null}
        {row.pendingSuggestions > 0 ? (
          <Text color="yellow">  ✎{row.pendingSuggestions}</Text>
        ) : null}
      </Text>
    </Box>
  );
}

function InspectorCard({
  snapshot,
  row,
  tab,
  eventFilter,
  eventFilterOpen,
  onFilterChange,
  onFilterSubmit,
}: {
  snapshot: ShellSnapshot;
  row: ShellRunRow | null;
  tab: RunInspectorTab;
  eventFilter: string;
  eventFilterOpen: boolean;
  onFilterChange: (q: string) => void;
  onFilterSubmit: () => void;
}) {
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      {row ? (
        <>
          <InspectorHeader row={row} />
          <TabStrip current={tab} />
          <Box marginTop={1} flexDirection="column">
            {tab === "overview" ? (
              <OverviewSection row={row} />
            ) : tab === "events" ? (
              <EventsSection
                snapshot={snapshot}
                row={row}
                eventFilter={eventFilter}
                eventFilterOpen={eventFilterOpen}
                onFilterChange={onFilterChange}
                onFilterSubmit={onFilterSubmit}
              />
            ) : tab === "audit" ? (
              <AuditSection snapshot={snapshot} row={row} />
            ) : (
              <ValidationSection snapshot={snapshot} row={row} />
            )}
          </Box>
        </>
      ) : (
        <Text dimColor>select a run on the left</Text>
      )}
    </Box>
  );
}

function InspectorHeader({ row }: { row: ShellRunRow }) {
  const tok = runStatusToken(row.status);
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={tok.color}>{tok.glyph}</Text>
        <Text bold>  {clip(row.displayName || row.task, 60)}</Text>
      </Text>
      <Text dimColor>
        {row.runId}   ·   {tok.label}
        {row.pauseRequested && row.status !== "paused" ? "   · pausing" : ""}
      </Text>
    </Box>
  );
}

function TabStrip({ current }: { current: RunInspectorTab }) {
  return (
    <Box marginTop={1}>
      <Text>
        {RUN_INSPECTOR_TABS.map((t, i) => {
          const active = t === current;
          return (
            <React.Fragment key={t}>
              {i > 0 ? <Text dimColor>   </Text> : null}
              {active ? (
                <Text color="cyan" bold>
                  ▸ {TAB_KEYS[t]} {TAB_LABELS[t]}
                </Text>
              ) : (
                <Text dimColor>
                  {"  "}
                  {TAB_KEYS[t]} {TAB_LABELS[t]}
                </Text>
              )}
            </React.Fragment>
          );
        })}
        <Text dimColor>     tab cycles</Text>
      </Text>
    </Box>
  );
}

function OverviewSection({ row }: { row: ShellRunRow }) {
  const isTerminal = ["merge_ready", "failed", "aborted", "blocked"].includes(
    row.status,
  );
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap">
        <Field label="updated" value={timeAgo(row.updatedAt)} />
        {row.taskId ? <Field label="task" value={row.taskId} /> : null}
        {row.crewId ? <Field label="crew" value={row.crewId} /> : null}
        {row.profileOverride ? (
          <Field label="profile" value={row.profileOverride} />
        ) : null}
        {row.readOnly ? <Field label="mode" value="read-only" tint="yellow" /> : null}
        {row.pausedAtStatus ? (
          <Field label="paused at" value={row.pausedAtStatus} />
        ) : null}
        {row.flow ? (
          <Field
            label="flow"
            value={`${row.flow.label} ${row.flow.completedSteps}/${row.flow.totalSteps}`}
          />
        ) : null}
      </Box>
      {row.flow?.currentStepLabel ? (
        <Text>
          <Text dimColor>step   </Text>
          <Text color="cyan">{row.flow.currentStepLabel}</Text>
          {row.flow.currentStepStatus ? (
            <Text dimColor>   {row.flow.currentStepStatus}</Text>
          ) : null}
        </Text>
      ) : null}
      {row.flow?.seatStrip?.length ? (
        <Text wrap="truncate-end">
          <Text dimColor>seats  </Text>
          {row.flow.seatStrip.map((s, i) => (
            <Text key={i}>
              {i > 0 ? <Text dimColor>{" · "}</Text> : null}
              <Text
                color={
                  s.status === "running"
                    ? "cyan"
                    : s.status === "passed"
                      ? "green"
                      : s.status === "failed" || s.status === "blocked"
                        ? "red"
                        : undefined
                }
                dimColor={s.status === "pending" || s.status === "skipped"}
              >
                {s.label}
                {s.status === "running"
                  ? " >"
                  : s.status === "passed"
                    ? " ok"
                    : s.status === "failed" || s.status === "blocked"
                      ? " x"
                      : ""}
              </Text>
            </Text>
          ))}
        </Text>
      ) : null}
      {row.flow?.participantContexts.length ? (
        <Text>
          <Text dimColor>context</Text>
          <Text> {row.flow.participantContexts.join("  ")}</Text>
        </Text>
      ) : null}

      {/* Starting up: a staged checklist while the run sets up, or the
          failed stage. Hidden once the run is doing real work. */}
      {row.startup && (!row.startup.complete || row.startup.failedStage) ? (
        <Box flexDirection="column">
          {row.startup.stages.map((st) => {
            const glyph =
              st.status === "done"
                ? "ok"
                : st.status === "active"
                  ? ">"
                  : st.status === "failed"
                    ? "x"
                    : st.status === "skipped"
                      ? "-"
                      : ".";
            const col =
              st.status === "failed"
                ? "red"
                : st.status === "active"
                  ? "cyan"
                  : st.status === "done"
                    ? "green"
                    : undefined;
            return (
              <Text key={st.stage}>
                <Text dimColor>{"  "}</Text>
                <Text color={col}>{glyph} </Text>
                <Text dimColor={st.status === "pending" || st.status === "skipped"}>
                  {st.label}
                </Text>
                {st.detail ? <Text dimColor>{`  ${st.detail}`}</Text> : null}
              </Text>
            );
          })}
        </Box>
      ) : null}

      {/* Workspace: where the run's work lives. `vibe path <id>` prints
          a copy-able cd line; here we just surface the location + branch. */}
      {row.worktreePath ? (
        <Text wrap="truncate-middle">
          <Text dimColor>work   </Text>
          <Text>{row.worktreePath}</Text>
          {row.branchName ? <Text dimColor>{"   ⎇ "}{row.branchName}</Text> : null}
        </Text>
      ) : null}

      {/* Terminal runs answer "why" first, then who. Active runs lead
          with the current agent. */}
      {isTerminal ? (
        <Box marginTop={1} flexDirection="column">
          {row.error ? (
            <Text>
              <Text color="red">why    </Text>
              <Text>{row.error}</Text>
            </Text>
          ) : (
            <Box flexDirection="column">
              <Text>
                <Text color="red">why    </Text>
                <Text dimColor>
                  no reason stamped on disk - open <Text color="cyan">e</Text>{" "}
                  Events for the full timeline or run{" "}
                  <Text color="cyan">vibe replay {row.runId}</Text>
                </Text>
              </Text>
            </Box>
          )}
          {row.finalDecision ? (
            <Text>
              <Text dimColor>review </Text>
              <Text>{row.finalDecision}</Text>
              {row.reviewSummary && row.reviewSummary.findingCount > 0 ? (
                <Text dimColor>
                  {"   "}{row.reviewSummary.findingCount} finding
                  {row.reviewSummary.findingCount === 1 ? "" : "s"}
                </Text>
              ) : null}
            </Text>
          ) : null}
          {row.reviewSummary?.headlines.map((h, i) => (
            <Text key={i}>
              <Text dimColor>{"       · "}</Text>
              <Text color="yellow">{clip(h, 90)}</Text>
            </Text>
          ))}
          {row.verification ? (
            <Text>
              <Text dimColor>verify </Text>
              <Text>{row.verification}</Text>
            </Text>
          ) : null}
          <Text>
            <Text dimColor>agent  </Text>
            <Text color="cyan">{row.lastRole ?? "-"}</Text>
            {row.lastRole ? <Text dimColor>   (last to run)</Text> : null}
            {!row.lastRole ? (
              <Text dimColor>
                {"   "}(never started - preflight or policy stopped it)
              </Text>
            ) : null}
          </Text>
          <Box marginTop={1}>
            <Text dimColor>
              press <Text color="cyan">R</Text> to re-run as a fresh{" "}
              <Text color="cyan">vibe run</Text>{" "}
              {row.taskId ? (
                <Text>(linked to {row.taskId})</Text>
              ) : (
                <Text>(no task link - starts a new ad-hoc run)</Text>
              )}
            </Text>
          </Box>
        </Box>
      ) : (
        <>
          <Box marginTop={1}>
            {row.currentRole ? (
              <Text>
                <Text dimColor>current  </Text>
                <Text color="cyan">{row.currentRole}</Text>
                {row.currentProvider ? (
                  <Text dimColor>   via {row.currentProvider}</Text>
                ) : null}
              </Text>
            ) : row.lastRole ? (
              <Text>
                <Text dimColor>last     </Text>
                <Text color="cyan">{row.lastRole}</Text>
                <Text dimColor>   (between agents)</Text>
              </Text>
            ) : (
              <Text dimColor>no active agent yet</Text>
            )}
          </Box>
          {row.currentSkills.length > 0 ? (
            <Text>
              <Text dimColor>skills   </Text>
              <Text>{row.currentSkills.join(", ")}</Text>
            </Text>
          ) : null}
          {row.currentMcpServers.length > 0 ? (
            <Text>
              <Text dimColor>mcp      </Text>
              <Text>{row.currentMcpServers.join(", ")}</Text>
            </Text>
          ) : null}
        </>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {row.pendingApprovals} pending approval(s) ·{" "}
          {row.pendingSuggestions} pending suggestion(s)
        </Text>
      </Box>
    </Box>
  );
}

function EventsSection({
  snapshot,
  row,
  eventFilter,
  eventFilterOpen,
  onFilterChange,
  onFilterSubmit,
}: {
  snapshot: ShellSnapshot;
  row: ShellRunRow;
  eventFilter: string;
  eventFilterOpen: boolean;
  onFilterChange: (q: string) => void;
  onFilterSubmit: () => void;
}) {
  const events = snapshot.recentEvents[row.runId] ?? [];
  const { visible, totalCount } = filterEvents(events, eventFilter);
  return (
    <Box flexDirection="column">
      <Box>
        {eventFilterOpen ? (
          <Box>
            <Text color="cyan" bold>
              /{" "}
            </Text>
            <TextInput
              value={eventFilter}
              onChange={onFilterChange}
              onSubmit={onFilterSubmit}
              placeholder="filter - Enter to commit · Esc to clear"
            />
          </Box>
        ) : (
          <Text dimColor>
            press <Text color="cyan">/</Text> to filter ·{" "}
            {eventFilter ? (
              <Text>
                <Text color="cyan">{eventFilter}</Text> matches{" "}
                {visible.length}/{totalCount}
              </Text>
            ) : (
              <Text>{totalCount} event{totalCount === 1 ? "" : "s"}</Text>
            )}
          </Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {visible.length === 0 ? (
          <Text dimColor>no matching events</Text>
        ) : (
          visible.slice(-12).map((ev, i) => (
            <Box key={`${ev.timestamp}-${i}`}>
              <Text>
                <Text dimColor>{timeAgo(ev.timestamp).padStart(7)}</Text>
                {"  "}
                <Text color={eventTypeColor(ev.type)}>
                  {clip(ev.type, 22).padEnd(22)}
                </Text>
                {"  "}
                <Text>{clip(ev.message, 80)}</Text>
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

function ValidationSection({
  snapshot,
  row,
}: {
  snapshot: ShellSnapshot;
  row: ShellRunRow;
}) {
  const events = snapshot.recentEvents[row.runId] ?? [];
  const valEvents = events.filter((e) => e.type.startsWith("validation"));
  if (valEvents.length === 0) {
    return (
      <Text dimColor>
        no validation events yet - they appear after{" "}
        <Text color="cyan">vibe validation run</Text> or a post-apply
        validate.
      </Text>
    );
  }
  return (
    <Box flexDirection="column">
      {valEvents.slice(-10).map((ev, i) => (
        <Box key={`${ev.timestamp}-${i}`}>
          <Text>
            <Text dimColor>{timeAgo(ev.timestamp).padStart(7)}</Text>
            {"  "}
            <Text color={eventTypeColor(ev.type)}>
              {clip(ev.type, 22).padEnd(22)}
            </Text>
            {"  "}
            <Text>{clip(ev.message, 80)}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/**
 * The `audit` inspector tab: a TUI render of the run-audit tree (parity with
 * `vibe audit`). Derived lazily for the selected run only (see useRunAudit),
 * since the full audit reads more than the snapshot's event tail.
 */
function AuditSection({
  snapshot,
  row,
}: {
  snapshot: ShellSnapshot;
  row: ShellRunRow;
}) {
  const audit = useRunAudit(snapshot.projectRoot, row.runId);
  return <AuditView audit={audit} />;
}

const STEP_GLYPH: Record<string, { glyph: string; color?: string }> = {
  passed: { glyph: "ok", color: "green" },
  failed: { glyph: "x", color: "red" },
  blocked: { glyph: "x", color: "red" },
  running: { glyph: ">", color: "cyan" },
  skipped: { glyph: "-" },
  pending: { glyph: "." },
};

/** Pure render of a run audit (no data fetching), so it can be unit-tested. */
export function AuditView({ audit }: { audit: RunAudit | null }) {
  if (!audit) return <Text dimColor>deriving audit…</Text>;
  if (audit.steps.length === 0) {
    return (
      <Text dimColor>
        no steps recorded yet - the audit fills in as the run executes.
      </Text>
    );
  }
  const t = audit.totals;
  return (
    <Box flexDirection="column">
      <Text dimColor>
        {t.turns} turn{t.turns === 1 ? "" : "s"} · {t.retries} retr
        {t.retries === 1 ? "y" : "ies"} · {t.fallbacks} fallback
        {t.fallbacks === 1 ? "" : "s"}
        {t.costUsd != null ? ` · $${t.costUsd.toFixed(2)}` : ""}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {audit.steps.map((s) => (
          <AuditStepRow key={s.id} step={s} />
        ))}
      </Box>
      {audit.control.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>control</Text>
          {audit.control.slice(0, 6).map((c, i) => (
            <Text key={i} wrap="truncate-end">
              <Text dimColor>{"  "}</Text>
              <Text color="yellow">{c.type}</Text>
              <Text dimColor>{"  "}{clip(c.message, 70)}</Text>
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function AuditStepRow({ step }: { step: AuditStep }) {
  const g = STEP_GLYPH[step.status] ?? { glyph: "·" };
  const dim = step.status === "pending" || step.status === "skipped";
  return (
    <Text wrap="truncate-end">
      <Text color={g.color}>{g.glyph.padEnd(2)} </Text>
      <Text dimColor={dim}>{clip(step.label, 22).padEnd(22)}</Text>
      <Text dimColor>{(step.stage ?? "").padEnd(12)}</Text>
      {step.retries > 0 ? <Text color="yellow">{` ↻${step.retries}`}</Text> : null}
      {step.fellBack ? <Text color="cyan"> ⤳ fallback</Text> : null}
      {step.decision ? <Text dimColor>{`  ${step.decision}`}</Text> : null}
    </Text>
  );
}

function Field({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: "yellow" | "red";
}) {
  return (
    <Box marginRight={3}>
      <Text>
        <Text dimColor>{label} </Text>
        <Text color={tint}>{value}</Text>
      </Text>
    </Box>
  );
}

/**
 * Friendly 3-step quickstart shown when no runs exist yet. Teaches
 * the workflow instead of just saying "no runs yet".
 */
function EmptyRunsWalkthrough() {
  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>Welcome - here's the flow</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="cyan">1.</Text>
          <Text>  Define a </Text>
          <Text bold>task</Text>
          <Text dimColor>          press </Text>
          <Text color="cyan">2</Text>
          <Text dimColor> for Roadmap, then </Text>
          <Text color="cyan">n</Text>
        </Text>
        <Text>
          <Text color="cyan">2.</Text>
          <Text>  Run it </Text>
          <Text dimColor>(creates a run)</Text>
          <Text dimColor>      press </Text>
          <Text color="cyan">↵</Text>
          <Text dimColor> on the selected task</Text>
        </Text>
        <Text>
          <Text color="cyan">3.</Text>
          <Text>  Watch it execute </Text>
          <Text dimColor>here</Text>
          <Text dimColor>    each run = one execution; status pills tell you where it is</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          shortcut: <Text color="cyan">!</Text> opens the runner -
          {' '}<Text>vibe run "describe the change"</Text>
        </Text>
      </Box>
    </Box>
  );
}
