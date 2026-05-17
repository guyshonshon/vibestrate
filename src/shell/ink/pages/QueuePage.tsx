import React from "react";
import { Box, Text, useInput } from "ink";
import type { ShellSnapshot } from "../../shell-snapshot.js";
import type { ConflictWarning } from "../../../scheduler/scheduler-types.js";
import { clip } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";
import {
  pauseScheduler,
  removeQueueEntry,
  resumeScheduler,
} from "../queue/queue-actions.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";

type Props = {
  projectRoot: string;
  snapshot: ShellSnapshot;
  warnings: ConflictWarning[];
  refreshSnapshot: () => Promise<void>;
  refreshWarnings: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  active: boolean;
};

export function QueuePage({
  projectRoot,
  snapshot,
  warnings,
  refreshSnapshot,
  refreshWarnings,
  onToast,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const entries = snapshot.queue;
  const sched = snapshot.scheduler;
  const idx = Math.max(0, Math.min(entries.length - 1, selectedIndex));
  const selected = entries[idx] ?? null;
  const { rows } = useTerminalSize();
  const queueCap = Math.max(3, Math.floor((rows - 14) / 1));
  const warningsCap = Math.max(2, Math.floor((rows - 18) / 2));

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(entries.length - 1, idx + 1));
        return;
      }
      // p toggles scheduler pause/resume, P resumes specifically.
      if (input === "p") {
        if (sched?.paused) {
          void resumeScheduler(projectRoot).then(async (r) => {
            onToast(r.ok ? "ok" : "err", r.message);
            await refreshSnapshot();
          });
        } else {
          void pauseScheduler(projectRoot).then(async (r) => {
            onToast(r.ok ? "ok" : "err", r.message);
            await refreshSnapshot();
          });
        }
        return;
      }
      if (input === "x" && selected) {
        void removeQueueEntry(projectRoot, selected.taskId).then(async (r) => {
          onToast(r.ok ? "ok" : "err", r.message);
          await refreshSnapshot();
        });
        return;
      }
      void refreshWarnings;
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column">
      <SchedulerHeader sched={sched} />
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">
          QUEUED
          <Text dimColor>   ({entries.length})</Text>
        </Text>
        <Box flexDirection="column">
          {entries.length === 0 ? (
            <Text dimColor>
              queue is empty — add a task with{" "}
              <Text color="cyan">amaco queue add &lt;taskId&gt;</Text> or from
              the Roadmap (Q on a selected task)
            </Text>
          ) : (
            entries.slice(0, queueCap).map((e, i) => (
              <Box key={e.taskId}>
                <SelectionMark selected={i === idx} />
                <Text>
                  <Text bold={i === idx}>
                    {clip(e.taskId, 28).padEnd(28)}
                  </Text>
                  <Text dimColor>  prio </Text>
                  <Text>{e.priority.padEnd(6)}</Text>
                  <Text dimColor>  src </Text>
                  <Text color="cyan">{e.source.padEnd(10)}</Text>
                  <Text dimColor>
                    {"  "}enqueued {new Date(e.enqueuedAt).toLocaleTimeString()}
                  </Text>
                </Text>
              </Box>
            ))
          )}
          {entries.length > queueCap ? (
            <Text dimColor>+ {entries.length - queueCap} more</Text>
          ) : null}
        </Box>
      </Box>

      {sched && sched.runningTaskIds.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">
            RUNNING
            <Text dimColor>   ({sched.runningTaskIds.length})</Text>
          </Text>
          {sched.runningTaskIds.map((id) => (
            <Text key={id}>
              <Text color="magenta">●</Text>
              <Text>  {id}</Text>
            </Text>
          ))}
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">
          CONFLICT WARNINGS
          <Text dimColor>   ({warnings.length})</Text>
        </Text>
        {warnings.length === 0 ? (
          <Text dimColor>no conflict warnings</Text>
        ) : (
          warnings.slice(-warningsCap).map((w) => (
            <Box key={w.id} flexDirection="column">
              <Text>
                <Text color={w.blocked ? "red" : "yellow"}>
                  {w.blocked ? "✗" : "!"}
                </Text>
                <Text>  {w.taskId}</Text>
                <Text dimColor>   overlaps with </Text>
                <Text>{w.conflictsWith.join(", ")}</Text>
                <Text dimColor>
                  {"   "}
                  {w.overlappingFiles.length} file
                  {w.overlappingFiles.length === 1 ? "" : "s"} ·{" "}
                  {w.blocked ? "blocked" : "warned"}
                </Text>
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

function SchedulerHeader({
  sched,
}: {
  sched: ShellSnapshot["scheduler"];
}) {
  if (!sched) {
    return (
      <Text dimColor>
        no scheduler state on disk — start it with{" "}
        <Text color="cyan">amaco queue run</Text>
      </Text>
    );
  }
  const pauseBar = sched.paused ? "yellow" : "cyan";
  const pauseLabel = sched.paused ? "paused" : "running";
  return (
    <Box flexWrap="wrap">
      <Text>
        <Text color={pauseBar}>▌</Text>
        <Text dimColor>state </Text>
        <Text bold color={pauseBar}>
          {pauseLabel}
        </Text>
        <Text dimColor>   ·   </Text>
        <Text dimColor>policy </Text>
        <Text bold>{sched.queuePolicy}</Text>
        <Text dimColor>   ·   </Text>
        <Text dimColor>max </Text>
        <Text bold>{sched.maxConcurrentRuns}</Text>
        {Object.keys(sched.sourceQuotas).length > 0 ? (
          <>
            <Text dimColor>   ·   </Text>
            <Text dimColor>quotas </Text>
            <Text bold>{Object.keys(sched.sourceQuotas).length}</Text>
          </>
        ) : null}
        {typeof sched.defaultSourceConcurrency === "number" ? (
          <>
            <Text dimColor>   ·   </Text>
            <Text dimColor>default/src </Text>
            <Text bold>{sched.defaultSourceConcurrency}</Text>
          </>
        ) : null}
      </Text>
    </Box>
  );
}
