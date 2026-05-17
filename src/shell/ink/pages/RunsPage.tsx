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
    <Box flexDirection="row" gap={1}>
      <Box flexBasis={0} flexGrow={2}>
        <RunsList runs={runs} selectedIndex={selectedIndex} />
      </Box>
      <Box flexBasis={0} flexGrow={3}>
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
        {runs.length === 0 ? (
          <Text dimColor>
            no runs yet —{" "}
            <Text color="cyan">amaco run "describe the change"</Text>
          </Text>
        ) : (
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
  const cursor = selected ? "▸" : " ";
  return (
    <Box>
      <Text color={selected ? "cyan" : undefined}>{cursor}</Text>
      <Text> </Text>
      <Text bold={selected} color={selected ? "cyan" : undefined}>
        <Text color={tok.color}>{tok.glyph}</Text>
        <Text>  {clip(row.task, 30).padEnd(30)}</Text>
        <Text dimColor>  {clip(row.currentAgent ?? "—", 10).padEnd(10)}</Text>
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
        <Text bold>  {clip(row.task, 60)}</Text>
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
        {RUN_INSPECTOR_TABS.map((t, i) => (
          <React.Fragment key={t}>
            {i > 0 ? <Text dimColor>   </Text> : null}
            {t === current ? (
              <Text color="cyan" bold>
                {TAB_KEYS[t]} {TAB_LABELS[t]}
              </Text>
            ) : (
              <Text dimColor>
                {TAB_KEYS[t]} {TAB_LABELS[t]}
              </Text>
            )}
          </React.Fragment>
        ))}
        <Text dimColor>     tab cycles</Text>
      </Text>
    </Box>
  );
}

function OverviewSection({ row }: { row: ShellRunRow }) {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap">
        <Field label="updated" value={timeAgo(row.updatedAt)} />
        {row.taskId ? <Field label="task" value={row.taskId} /> : null}
        {row.effort ? <Field label="effort" value={row.effort} /> : null}
        {row.providerOverride ? (
          <Field label="override" value={row.providerOverride} />
        ) : null}
        {row.resolvedProviderId ? (
          <Field label="provider" value={row.resolvedProviderId} />
        ) : null}
        {row.readOnly ? <Field label="mode" value="read-only" tint="yellow" /> : null}
        {row.pausedAtStatus ? (
          <Field label="paused at" value={row.pausedAtStatus} />
        ) : null}
      </Box>
      <Box marginTop={1}>
        {row.currentAgent ? (
          <Text>
            <Text dimColor>current  </Text>
            <Text color="cyan">{row.currentAgent}</Text>
            {row.currentProvider ? (
              <Text dimColor>   via {row.currentProvider}</Text>
            ) : null}
          </Text>
        ) : (
          <Text dimColor>no active agent</Text>
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
              placeholder="filter — Enter to commit · Esc to clear"
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
        no validation events yet — they appear after{" "}
        <Text color="cyan">amaco validation run</Text> or a post-apply
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
