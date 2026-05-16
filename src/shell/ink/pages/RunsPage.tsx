import React from "react";
import { Box, Text } from "ink";
import type { ShellSnapshot, ShellRunRow } from "../../shell-snapshot.js";

type Props = {
  snapshot: ShellSnapshot;
  selectedIndex: number;
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

function truncate(s: string, w: number): string {
  if (s.length <= w) return s;
  return `${s.slice(0, Math.max(0, w - 1))}…`;
}

export function RunsPage({ snapshot, selectedIndex }: Props) {
  const runs = snapshot.runs;
  const selected = runs[selectedIndex] ?? null;
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text dimColor>
        RUNS · {runs.length} total
        {snapshot.scheduler
          ? `   scheduler ${snapshot.scheduler.paused ? "paused" : "running"} · ${snapshot.scheduler.queuePolicy} · max ${snapshot.scheduler.maxConcurrentRuns}`
          : ""}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {runs.length === 0 ? (
          <Text dimColor>
            no runs found — start one with{" "}
            <Text bold>amaco run "describe the change"</Text>
          </Text>
        ) : (
          runs.slice(0, 12).map((r, i) => (
            <RunRow
              key={r.runId}
              row={r}
              selected={i === selectedIndex}
            />
          ))
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>INSPECTOR</Text>
        {selected ? (
          <RunInspector snapshot={snapshot} row={selected} />
        ) : (
          <Text dimColor>(no run selected)</Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>
          QUEUE · {snapshot.queue.length} waiting ·{" "}
          {snapshot.scheduler?.runningTaskIds.length ?? 0} running
        </Text>
        {snapshot.queue.length === 0 ? (
          <Text dimColor>queue is empty</Text>
        ) : (
          snapshot.queue.slice(0, 4).map((e) => (
            <Text key={e.taskId} dimColor>
              {"  "}
              {truncate(e.taskId, 24).padEnd(24)}{" "}
              <Text dimColor>prio={e.priority}</Text>{"  "}
              <Text dimColor>src={e.source}</Text>
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

function RunRow({ row, selected }: { row: ShellRunRow; selected: boolean }) {
  const cursor = selected ? "›" : " ";
  return (
    <Box>
      <Text color={selected ? "cyan" : undefined}>{cursor} </Text>
      <Text inverse={selected}>
        <Text>{truncate(row.runId, 18).padEnd(18)} </Text>
        <Text color={statusColor(row.status)}>
          {row.status.padEnd(14)}
        </Text>{" "}
        <Text color={row.currentAgent ? undefined : "gray"} dimColor={!row.currentAgent}>
          {(row.currentAgent ?? "—").padEnd(11)}
        </Text>{" "}
        <Text
          color={row.currentProvider ? undefined : "gray"}
          dimColor={!row.currentProvider}
        >
          {(row.currentProvider ?? row.resolvedProviderId ?? "—").padEnd(14)}
        </Text>{" "}
        <Text>{truncate(row.task, 60)}</Text>
        {row.effort ? <Text dimColor> [{row.effort}]</Text> : null}
        {row.readOnly ? <Text dimColor> [read-only]</Text> : null}
        {row.pauseRequested && row.status !== "paused" ? (
          <Text color="yellow"> (pausing)</Text>
        ) : null}
      </Text>
    </Box>
  );
}

function RunInspector({
  snapshot,
  row,
}: {
  snapshot: ShellSnapshot;
  row: ShellRunRow;
}) {
  const events = snapshot.recentEvents[row.runId] ?? [];
  const tail = events.slice(-6);
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{row.runId}</Text>{" "}
        <Text color={statusColor(row.status)}>{row.status}</Text>
        {row.taskId ? <Text dimColor>  task={row.taskId}</Text> : null}
        {row.effort ? <Text dimColor>  effort={row.effort}</Text> : null}
        {row.readOnly ? <Text color="yellow">  read-only</Text> : null}
      </Box>
      <Box>
        {row.currentAgent ? (
          <Text>
            agent=<Text color="cyan">{row.currentAgent}</Text>
            {row.currentProvider ? `  provider=${row.currentProvider}` : ""}
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
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>recent events</Text>
        {tail.length === 0 ? (
          <Text dimColor>no events yet</Text>
        ) : (
          tail.map((ev, i) => (
            <Box key={i}>
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
