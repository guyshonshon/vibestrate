import React from "react";
import { Box, Text } from "ink";
import type { ShellSnapshot } from "../../shell-snapshot.js";
import {
  CARD_PROPS,
  clip,
  eventTypeColor,
  runStatusToken,
  timeAgo,
} from "../theme.js";

type Props = {
  snapshot: ShellSnapshot;
};

export function DashboardPage({ snapshot }: Props) {
  const agg = snapshot.aggregates;
  const sched = snapshot.scheduler;
  const activeRuns = snapshot.runs.filter((r) => {
    const t = runStatusToken(r.status);
    return t.color !== "red" && t.color !== "green" && r.status !== "blocked";
  });
  const recentlyDone = snapshot.runs
    .filter((r) => ["failed", "aborted", "merge_ready"].includes(r.status))
    .slice(0, 3);

  return (
    <Box flexDirection="column">
      {/* Stat strip — five cards across the top, no clutter inside. */}
      <Box flexDirection="row" gap={1}>
        <StatCard label="active" value={String(agg.activeRuns)} accent />
        <StatCard
          label="queue"
          value={`${agg.queueRunning}/${agg.queueWaiting}`}
          hint="running / waiting"
        />
        <StatCard
          label="approvals"
          value={String(agg.pendingApprovalsTotal)}
          tint={agg.pendingApprovalsTotal > 0 ? "yellow" : undefined}
        />
        <StatCard
          label="suggestions"
          value={String(agg.pendingSuggestionsTotal)}
          tint={agg.pendingSuggestionsTotal > 0 ? "yellow" : undefined}
        />
        <StatCard
          label="scheduler"
          value={sched ? (sched.paused ? "paused" : sched.queuePolicy) : "—"}
          tint={sched?.paused ? "yellow" : undefined}
        />
      </Box>

      {/* Two-column body: Active Runs and Recent Activity. */}
      <Box flexDirection="row" marginTop={1} gap={1}>
        <Box flexBasis={0} flexGrow={1}>
          <SectionCard title="active runs" count={activeRuns.length}>
            {activeRuns.length === 0 ? (
              <Text dimColor>
                press <Text color="cyan">2</Text> to open Runs ·{" "}
                <Text color="cyan">:</Text> for commands
              </Text>
            ) : (
              <Box flexDirection="column">
                {activeRuns.slice(0, 6).map((r) => {
                  const tok = runStatusToken(r.status);
                  return (
                    <Box key={r.runId}>
                      <Text>
                        <Text color={tok.color}>{tok.glyph}</Text>
                        {"  "}
                        <Text>{clip(r.task, 38).padEnd(38)}</Text>
                        {"  "}
                        <Text dimColor>{clip(r.currentAgent ?? "—", 10)}</Text>
                        {r.pendingApprovals > 0 ? (
                          <Text color="yellow">  ⏳{r.pendingApprovals}</Text>
                        ) : null}
                        {r.pendingSuggestions > 0 ? (
                          <Text color="yellow">  ✎{r.pendingSuggestions}</Text>
                        ) : null}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            )}
          </SectionCard>
        </Box>
        <Box flexBasis={0} flexGrow={1}>
          <SectionCard
            title="recent activity"
            count={snapshot.recentActivity.length}
          >
            {snapshot.recentActivity.length === 0 ? (
              <Text dimColor>no events yet</Text>
            ) : (
              <Box flexDirection="column">
                {snapshot.recentActivity.slice(0, 8).map((a, i) => (
                  <Box key={`${a.runId}-${i}`}>
                    <Text>
                      <Text dimColor>{timeAgo(a.event.timestamp).padEnd(8)}</Text>
                      <Text color={eventTypeColor(a.event.type)}>
                        {clip(a.event.type, 18).padEnd(18)}
                      </Text>
                      <Text dimColor>{"  "}</Text>
                      <Text>{clip(a.event.message, 36)}</Text>
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        </Box>
      </Box>

      {recentlyDone.length > 0 ? (
        <Box marginTop={1}>
          <SectionCard title="recently finished" count={recentlyDone.length}>
            <Box flexDirection="column">
              {recentlyDone.map((r) => {
                const tok = runStatusToken(r.status);
                return (
                  <Box key={r.runId}>
                    <Text>
                      <Text color={tok.color}>{tok.glyph}</Text>
                      <Text dimColor>  {tok.label.padEnd(14)}</Text>
                      <Text>{clip(r.task, 60)}</Text>
                      <Text dimColor>   {timeAgo(r.updatedAt)}</Text>
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </SectionCard>
        </Box>
      ) : null}
    </Box>
  );
}

function StatCard({
  label,
  value,
  hint,
  tint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tint?: "yellow" | "red" | "green";
  accent?: boolean;
}) {
  return (
    <Box
      {...CARD_PROPS}
      borderColor={accent ? "cyan" : undefined}
      flexDirection="column"
      flexBasis={0}
      flexGrow={1}
    >
      <Text dimColor>{label}</Text>
      <Text bold color={tint ?? (accent ? "cyan" : undefined)}>
        {value}
      </Text>
      {hint ? <Text dimColor>{hint}</Text> : null}
    </Box>
  );
}

function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Box {...CARD_PROPS} flexDirection="column">
      <Box>
        <Text dimColor>
          {title}
          {typeof count === "number" ? `   (${count})` : ""}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
