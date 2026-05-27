import React from "react";
import { Box, Text } from "ink";
import type { ShellSnapshot } from "../../shell-snapshot.js";
import {
  clip,
  eventTypeColor,
  runStatusToken,
  timeAgo,
} from "../theme.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

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

  const { cols, rows } = useTerminalSize();
  // Vertical budget: terminal rows minus chrome (frame border 2, header
  // 1, tab + rule 2, footer + rule 3 ≈ 8). Divide what's left between
  // the two lists. Each row in a list is one terminal row.
  const contentRows = Math.max(6, rows - 11);
  const perList = Math.max(2, Math.floor((contentRows - 4) / 2));
  const stackedBody = cols < 110;
  const compact = rows < 26;

  return (
    <Box flexDirection="column">
      {/* Single-line stat strip — five chips separated by middle dots.
          Roughly 1 row, so the top nav stays visible even in short
          terminal panes. */}
      <StatStrip
        agg={agg}
        sched={sched ? { queuePolicy: sched.queuePolicy, paused: sched.paused } : null}
      />

      {/* Two side-by-side lists; stacked on narrower terminals. */}
      <Box flexDirection={stackedBody ? "column" : "row"} marginTop={1} gap={1}>
        <Box flexBasis={0} flexGrow={1} flexDirection="column">
          <SectionCard title="ACTIVE RUNS" count={activeRuns.length}>
            {activeRuns.length === 0 ? (
              <Text dimColor>
                press <Text color="cyan">2</Text> to open Runs ·{" "}
                <Text color="cyan">:</Text> for commands
              </Text>
            ) : (
              <Box flexDirection="column">
                {activeRuns.slice(0, perList).map((r) => {
                  const tok = runStatusToken(r.status);
                  return (
                    <Box key={r.runId}>
                      <Text>
                        <Text color={tok.color}>{tok.glyph}</Text>
                        {"  "}
                        <Text>{clip(r.task, 36).padEnd(36)}</Text>
                        {"  "}
                        <Text dimColor>{clip(r.currentRole ?? "—", 10)}</Text>
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
                {activeRuns.length > perList ? (
                  <Text dimColor>+ {activeRuns.length - perList} more</Text>
                ) : null}
              </Box>
            )}
          </SectionCard>
        </Box>
        <Box flexBasis={0} flexGrow={1} flexDirection="column">
          <SectionCard
            title="RECENT ACTIVITY"
            count={snapshot.recentActivity.length}
          >
            {snapshot.recentActivity.length === 0 ? (
              <Text dimColor>no events yet</Text>
            ) : (
              <Box flexDirection="column">
                {snapshot.recentActivity.slice(0, perList).map((a, i) => (
                  <Box key={`${a.runId}-${i}`}>
                    <Text>
                      <Text dimColor>{timeAgo(a.event.timestamp).padEnd(7)}</Text>
                      <Text color={eventTypeColor(a.event.type)}>
                        {clip(a.event.type, 18).padEnd(18)}
                      </Text>
                      <Text dimColor>{"  "}</Text>
                      <Text>{clip(a.event.message, 32)}</Text>
                    </Text>
                  </Box>
                ))}
                {snapshot.recentActivity.length > perList ? (
                  <Text dimColor>
                    + {snapshot.recentActivity.length - perList} more
                  </Text>
                ) : null}
              </Box>
            )}
          </SectionCard>
        </Box>
      </Box>

      {recentlyDone.length > 0 && !compact ? (
        <Box marginTop={1}>
          <SectionCard title="RECENTLY FINISHED" count={recentlyDone.length}>
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

/**
 * One-row stat strip used in place of multi-line StatCards on the
 * Dashboard. Each chip is `label N` with a leading `▌` color bar
 * (cyan accent · yellow warn · gray neutral) so the strip is
 * scannable without taking 4 vertical rows.
 */
function StatStrip({
  agg,
  sched,
}: {
  agg: {
    activeRuns: number;
    pendingApprovalsTotal: number;
    pendingSuggestionsTotal: number;
    queueWaiting: number;
    queueRunning: number;
  };
  sched: { queuePolicy: string; paused: boolean } | null;
}) {
  type ChipColor = "cyan" | "yellow" | "gray";
  type Chip = { label: string; value: string; color: ChipColor };
  const chips: Chip[] = [
    { label: "active", value: String(agg.activeRuns), color: "cyan" },
    {
      label: "queue",
      value: `${agg.queueRunning}/${agg.queueWaiting}`,
      color: "gray",
    },
    {
      label: "approvals",
      value: String(agg.pendingApprovalsTotal),
      color: agg.pendingApprovalsTotal > 0 ? "yellow" : "gray",
    },
    {
      label: "suggestions",
      value: String(agg.pendingSuggestionsTotal),
      color: agg.pendingSuggestionsTotal > 0 ? "yellow" : "gray",
    },
    {
      label: "scheduler",
      value: sched ? (sched.paused ? "paused" : sched.queuePolicy) : "—",
      color: sched?.paused ? "yellow" : "gray",
    },
  ];
  return (
    <Box flexWrap="wrap">
      <Text>
        {chips.map((c, i) => (
          <React.Fragment key={c.label}>
            {i > 0 ? <Text dimColor>   </Text> : null}
            <Text color={c.color}>▌</Text>
            <Text dimColor>{c.label} </Text>
            <Text bold color={c.color}>
              {c.value}
            </Text>
          </React.Fragment>
        ))}
      </Text>
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
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          {title}
        </Text>
        {typeof count === "number" ? (
          <Text dimColor>   ({count})</Text>
        ) : null}
      </Box>
      <Box flexDirection="column">{children}</Box>
    </Box>
  );
}
