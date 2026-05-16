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

type Props = {
  snapshot: ShellSnapshot;
  ui: ShellUiStateV2;
  onFilterChange: (q: string) => void;
  onFilterSubmit: () => void;
};

function statusColor(status: string): string | undefined {
  switch (status) {
    case "failed":
    case "aborted":
    case "blocked":
      return "red";
    case "paused":
    case "waiting_for_approval":
      return "yellow";
    case "merge_ready":
      return "green";
    case "planning":
    case "architecting":
    case "verifying":
    case "validating":
    case "reviewing":
      return "blue";
    case "executing":
    case "fixing":
      return "magenta";
    default:
      return undefined;
  }
}

function eventTypeColor(type: string): string | undefined {
  if (type.endsWith(".failed") || type === "run.aborted") return "red";
  if (type === "run.completed" || type === "agent.completed") return "green";
  if (type.startsWith("approval.")) return "yellow";
  if (type.startsWith("run.pause") || type.startsWith("run.resume"))
    return "yellow";
  if (type === "mcp.attached") return "magenta";
  if (type === "agent.started" || type === "provider.started") return "cyan";
  return undefined;
}

function truncate(s: string, w: number): string {
  if (s.length <= w) return s;
  return `${s.slice(0, Math.max(0, w - 1))}…`;
}

const TAB_LABELS: Record<RunInspectorTab, string> = {
  overview: "Overview",
  events: "Events",
  validation: "Validation",
};

const TAB_KEYS: Record<RunInspectorTab, string> = {
  overview: "o",
  events: "e",
  validation: "v",
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
  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* Left: runs list */}
      <Box
        flexDirection="column"
        width="38%"
        marginRight={1}
      >
        <Text dimColor>
          RUNS · {runs.length}
          {snapshot.scheduler
            ? `  ${snapshot.scheduler.paused ? "scheduler paused" : snapshot.scheduler.queuePolicy}`
            : ""}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {runs.length === 0 ? (
            <Text dimColor>
              no runs yet — <Text bold>amaco run "describe the change"</Text>
            </Text>
          ) : (
            runs.slice(0, 14).map((r, i) => (
              <RunRow
                key={r.runId}
                row={r}
                selected={i === selectedIndex}
              />
            ))
          )}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            QUEUE · {snapshot.queue.length} waiting ·{" "}
            {snapshot.scheduler?.runningTaskIds.length ?? 0} running
          </Text>
          {snapshot.queue.slice(0, 3).map((e) => (
            <Text key={e.taskId} dimColor>
              {"  "}
              {truncate(e.taskId, 22)} <Text>prio={e.priority}</Text>{" "}
              <Text>src={e.source}</Text>
            </Text>
          ))}
        </Box>
      </Box>

      {/* Right: inspector */}
      <Box flexDirection="column" flexGrow={1}>
        {selected ? (
          <Inspector
            snapshot={snapshot}
            row={selected}
            tab={ui.runs.inspectorTab}
            eventFilter={ui.runs.eventFilter}
            eventFilterOpen={ui.runs.eventFilterOpen}
            onFilterChange={onFilterChange}
            onFilterSubmit={onFilterSubmit}
          />
        ) : (
          <Text dimColor>(no run selected)</Text>
        )}
      </Box>
    </Box>
  );
}

function RunRow({ row, selected }: { row: ShellRunRow; selected: boolean }) {
  return (
    <Box>
      <Text color={selected ? "cyan" : undefined}>{selected ? "›" : " "} </Text>
      <Text inverse={selected}>
        <Text>{truncate(row.runId, 18).padEnd(18)} </Text>
        <Text color={statusColor(row.status)}>{row.status.padEnd(12)}</Text>
        {row.pendingApprovals > 0 ? (
          <Text color="yellow"> a{row.pendingApprovals}</Text>
        ) : null}
        {row.pendingSuggestions > 0 ? (
          <Text color="yellow"> s{row.pendingSuggestions}</Text>
        ) : null}
      </Text>
    </Box>
  );
}

function Inspector({
  snapshot,
  row,
  tab,
  eventFilter,
  eventFilterOpen,
  onFilterChange,
  onFilterSubmit,
}: {
  snapshot: ShellSnapshot;
  row: ShellRunRow;
  tab: RunInspectorTab;
  eventFilter: string;
  eventFilterOpen: boolean;
  onFilterChange: (q: string) => void;
  onFilterSubmit: () => void;
}) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{row.runId}</Text>
        <Text>  </Text>
        <Text color={statusColor(row.status)}>{row.status}</Text>
        {row.pauseRequested && row.status !== "paused" ? (
          <Text color="yellow">  (pausing)</Text>
        ) : null}
      </Box>
      <Box marginTop={1}>
        {RUN_INSPECTOR_TABS.map((t, i) => (
          <React.Fragment key={t}>
            {i > 0 ? <Text dimColor>  ·  </Text> : null}
            <Text color={t === tab ? "cyan" : undefined} dimColor={t !== tab}>
              <Text bold={t === tab}>
                {TAB_KEYS[t]} {TAB_LABELS[t]}
              </Text>
            </Text>
          </React.Fragment>
        ))}
        <Text dimColor>   tab to cycle</Text>
      </Box>
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
        ) : (
          <ValidationSection snapshot={snapshot} row={row} />
        )}
      </Box>
    </Box>
  );
}

function OverviewSection({ row }: { row: ShellRunRow }) {
  return (
    <Box flexDirection="column">
      <FactLine label="task">{row.task}</FactLine>
      {row.taskId ? <FactLine label="task id">{row.taskId}</FactLine> : null}
      <FactLine label="updated">{row.updatedAt}</FactLine>
      {row.effort ? <FactLine label="effort">{row.effort}</FactLine> : null}
      {row.providerOverride ? (
        <FactLine label="provider override">{row.providerOverride}</FactLine>
      ) : null}
      {row.resolvedProviderId ? (
        <FactLine label="resolved provider">{row.resolvedProviderId}</FactLine>
      ) : null}
      {row.readOnly ? (
        <FactLine label="mode">
          <Text color="yellow">read-only</Text>
        </FactLine>
      ) : null}
      {row.pausedAtStatus ? (
        <FactLine label="paused at">{row.pausedAtStatus}</FactLine>
      ) : null}
      <Box marginTop={1}>
        {row.currentAgent ? (
          <Text>
            current agent: <Text color="cyan">{row.currentAgent}</Text>
            {row.currentProvider
              ? `  provider=${row.currentProvider}`
              : ""}
          </Text>
        ) : (
          <Text dimColor>no active agent</Text>
        )}
      </Box>
      {row.currentSkills.length > 0 ? (
        <Text>skills: {row.currentSkills.join(", ")}</Text>
      ) : null}
      {row.currentMcpServers.length > 0 ? (
        <Text>mcp: {row.currentMcpServers.join(", ")}</Text>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>
          pending: {row.pendingApprovals} approval(s), {row.pendingSuggestions}{" "}
          suggestion(s)
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
          <>
            <Text color="cyan" bold>
              /{" "}
            </Text>
            <TextInput
              value={eventFilter}
              onChange={onFilterChange}
              onSubmit={onFilterSubmit}
              placeholder="filter events — Enter to commit, Esc to clear"
            />
          </>
        ) : (
          <Text dimColor>
            press <Text bold>/</Text> to filter
            {eventFilter ? (
              <Text>
                {" "}
                · filter <Text color="cyan">{eventFilter}</Text> matched{" "}
                {visible.length}/{totalCount}
              </Text>
            ) : (
              <Text> · {totalCount} event(s)</Text>
            )}
          </Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {visible.length === 0 ? (
          <Text dimColor>no matching events</Text>
        ) : (
          visible
            .slice(-Math.min(visible.length, 12))
            .map((ev, i) => (
              <Box key={`${ev.timestamp}-${i}`}>
                <Text dimColor>{ev.timestamp.slice(11, 19)}  </Text>
                <Text color={eventTypeColor(ev.type)}>{ev.type}</Text>
                <Text>  {truncate(ev.message, 80)}</Text>
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
  const lastResult = [...valEvents]
    .reverse()
    .find(
      (e) =>
        e.type === "validation.command.completed" ||
        e.type === "validation.started",
    );
  if (valEvents.length === 0) {
    return (
      <Text dimColor>
        no validation events for this run yet — they appear after{" "}
        <Text bold>amaco validation run</Text> or a post-apply validate.
      </Text>
    );
  }
  return (
    <Box flexDirection="column">
      <Text dimColor>recent validation events</Text>
      {valEvents.slice(-8).map((ev, i) => (
        <Box key={`${ev.timestamp}-${i}`}>
          <Text dimColor>{ev.timestamp.slice(11, 19)}  </Text>
          <Text color={eventTypeColor(ev.type)}>{ev.type}</Text>
          <Text>  {truncate(ev.message, 80)}</Text>
        </Box>
      ))}
      {lastResult ? (
        <Box marginTop={1}>
          <Text dimColor>last: </Text>
          <Text>{lastResult.message}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function FactLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text dimColor>{label}: </Text>
      <Text>{children}</Text>
    </Box>
  );
}
