import React from "react";
import { Box, Text } from "ink";
import type { StatusModel } from "../status-model.js";

/**
 * Persistent context strip under the Frame header — the Claude-Code-style
 * "where am I" line: project + git branch/worktree, safety mode + live
 * activity, the selected Crew + Flow, and the running task (if any).
 */
function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Text>
      <Text dimColor>{label} </Text>
      <Text color={color}>{value}</Text>
    </Text>
  );
}

function Sep() {
  return <Text dimColor>{"   ·   "}</Text>;
}

export function StatusBar({ model }: { model: StatusModel }) {
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap">
        <Field label="project" value={model.project} color="cyan" />
        <Sep />
        <Field label="branch" value={model.branch} color="white" />
        {model.worktree ? <Text color="magenta"> ⑂ worktree</Text> : null}
        <Sep />
        <Field
          label="mode"
          value={model.mode}
          color={model.mode === "read-only" ? "yellow" : "green"}
        />
        <Sep />
        <Text color={model.busy ? "cyan" : "gray"}>{model.activity}</Text>
      </Box>
      <Box flexWrap="wrap">
        <Field label="crew" value={model.crew} color="blue" />
        <Text dimColor> (c)</Text>
        <Sep />
        <Field label="flow" value={model.flow} color="blue" />
        <Text dimColor> (f)</Text>
        {model.runningTask ? (
          <>
            <Sep />
            <Field label="task" value={model.runningTask} color="white" />
          </>
        ) : null}
      </Box>
    </Box>
  );
}
