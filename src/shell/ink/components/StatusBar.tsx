import React from "react";
import { Box, Text } from "ink";
import { ACCENT_BRIGHT } from "../theme.js";
import type { StatusModel } from "../status-model.js";

/**
 * The context line above the prompt: the safety mode + selected Crew / Flow
 * that seed the next run (with their hotkeys), and the running task if any.
 * Project / branch / activity live in the header; this line is about *what
 * the next run will do*.
 */
function Field({
  label,
  value,
  color,
  hotkey,
}: {
  label: string;
  value: string;
  color?: string;
  hotkey?: string;
}) {
  return (
    <Text>
      <Text dimColor>{label} </Text>
      <Text color={color} bold>
        {value}
      </Text>
      {hotkey ? <Text dimColor> ({hotkey})</Text> : null}
    </Text>
  );
}

function Sep() {
  return <Text dimColor>{"     "}</Text>;
}

export function ContextLine({ model }: { model: StatusModel }) {
  return (
    <Box flexWrap="wrap">
      <Field
        label="mode"
        value={model.mode}
        color={model.mode === "read-only" ? "yellow" : "green"}
        hotkey="m"
      />
      <Sep />
      <Field label="crew" value={model.crew} color={ACCENT_BRIGHT} hotkey="c" />
      <Sep />
      <Field label="flow" value={model.flow} color={ACCENT_BRIGHT} hotkey="f" />
      {model.runningTask ? (
        <>
          <Sep />
          <Field label="task" value={model.runningTask} color="white" />
        </>
      ) : null}
    </Box>
  );
}
