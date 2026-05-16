import React from "react";
import { Box, Text } from "ink";
import type { ShellSnapshot } from "../../shell-snapshot.js";

type Props = {
  snapshot: ShellSnapshot;
};

const FAILED_TYPES = new Set([
  "agent.failed",
  "provider.failed",
  "run.failed",
  "run.aborted",
  "suggestion.apply_failed",
  "bundle.apply_failed",
  "suggestion.validation_failed",
  "bundle.validation_failed",
]);

function truncate(s: string, w: number): string {
  if (s.length <= w) return s;
  return `${s.slice(0, Math.max(0, w - 1))}…`;
}

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
  if (FAILED_TYPES.has(type)) return "red";
  if (type === "run.completed" || type === "agent.completed") return "green";
  if (type.startsWith("approval.")) return "yellow";
  if (type.startsWith("run.pause") || type.startsWith("run.resume"))
    return "yellow";
  if (type === "mcp.attached") return "magenta";
  if (type === "agent.started" || type === "provider.started") return "cyan";
  return undefined;
}

export function DashboardPage({ snapshot }: Props) {
  const agg = snapshot.aggregates;
  const sched = snapshot.scheduler;
  const activeRuns = snapshot.runs.filter(
    (r) => !["failed", "aborted", "merge_ready", "blocked"].includes(r.status),
  );
  const recentlyDone = snapshot.runs
    .filter((r) =>
      ["failed", "aborted", "merge_ready"].includes(r.status),
    )
    .slice(0, 4);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text dimColor>OVERVIEW</Text>
      <Box marginTop={1} flexDirection="row">
        <Stat label="active runs" value={String(agg.activeRuns)} />
        <Stat
          label="queue"
          value={`${agg.queueRunning} running · ${agg.queueWaiting} waiting`}
        />
        <Stat
          label="approvals"
          value={String(agg.pendingApprovalsTotal)}
          tint={agg.pendingApprovalsTotal > 0 ? "yellow" : undefined}
        />
        <Stat
          label="suggestions"
          value={String(agg.pendingSuggestionsTotal)}
          tint={agg.pendingSuggestionsTotal > 0 ? "yellow" : undefined}
        />
        <Stat
          label="scheduler"
          value={sched ? (sched.paused ? "paused" : sched.queuePolicy) : "—"}
          tint={sched?.paused ? "yellow" : undefined}
        />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>ACTIVE RUNS</Text>
        {activeRuns.length === 0 ? (
          <Text dimColor>
            no active runs — press <Text bold>2</Text> to open the Runs tab or{" "}
            <Text bold>:</Text> for the command palette.
          </Text>
        ) : (
          activeRuns.slice(0, 6).map((r) => (
            <Box key={r.runId}>
              <Text dimColor>{"  "}</Text>
              <Text>{truncate(r.runId, 18).padEnd(18)} </Text>
              <Text color={statusColor(r.status)}>
                {r.status.padEnd(14)}
              </Text>{" "}
              <Text dimColor>
                {(r.currentAgent ?? "—").padEnd(11)}{" "}
                {(r.currentProvider ?? r.resolvedProviderId ?? "—").padEnd(14)}
              </Text>{" "}
              <Text>{truncate(r.task, 50)}</Text>
              {r.pendingApprovals > 0 ? (
                <Text color="yellow">  {r.pendingApprovals} appr</Text>
              ) : null}
              {r.pendingSuggestions > 0 ? (
                <Text color="yellow">  {r.pendingSuggestions} sug</Text>
              ) : null}
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>RECENT ACTIVITY</Text>
        {snapshot.recentActivity.length === 0 ? (
          <Text dimColor>no events yet</Text>
        ) : (
          snapshot.recentActivity.slice(0, 10).map((a, i) => (
            <Box key={`${a.runId}-${i}`}>
              <Text dimColor>{a.event.timestamp.slice(11, 19)}  </Text>
              <Text>{truncate(a.runId, 18).padEnd(18)} </Text>
              <Text color={eventTypeColor(a.event.type)}>
                {a.event.type.padEnd(22)}
              </Text>{" "}
              <Text>{truncate(a.event.message, 60)}</Text>
            </Box>
          ))
        )}
      </Box>

      {recentlyDone.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>RECENTLY FINISHED</Text>
          {recentlyDone.map((r) => (
            <Box key={r.runId}>
              <Text dimColor>{"  "}</Text>
              <Text>{truncate(r.runId, 18).padEnd(18)} </Text>
              <Text color={statusColor(r.status)}>
                {r.status.padEnd(14)}
              </Text>{" "}
              <Text dimColor>{truncate(r.task, 50)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function Stat({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: "yellow" | "red" | "green";
}) {
  return (
    <Box flexDirection="column" marginRight={3} minWidth={16}>
      <Text dimColor>{label}</Text>
      <Text bold color={tint}>
        {value}
      </Text>
    </Box>
  );
}
