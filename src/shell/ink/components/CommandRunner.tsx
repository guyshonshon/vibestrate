import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { FOCAL_CARD_PROPS } from "../theme.js";

type Props = {
  input: string;
  output: string;
  running: boolean;
  exitCode: number | null;
  onChange: (v: string) => void;
  onSubmit: () => void;
};

/**
 * Modal overlay for "run an arbitrary vibestrate command". Renders the
 * input prompt with an `vibestrate` prefix, a live output viewport
 * capped at the last 18 lines, and the exit code once the spawn
 * completes.
 */
export function CommandRunner({
  input,
  output,
  running,
  exitCode,
  onChange,
  onSubmit,
}: Props) {
  const lines = output.split(/\r?\n/);
  const tail = lines.slice(-18);
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Box>
        <Text color="cyan" bold>
          $ vibestrate{" "}
        </Text>
        <TextInput
          value={input}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="status --json   ·   tasks list   ·   doctor --fix"
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {running ? (
          <Text dimColor>
            <Spinner type="dots" /> <Text>running…</Text>
          </Text>
        ) : exitCode !== null ? (
          <Text dimColor>
            <Text color={exitCode === 0 ? "green" : "red"}>
              {exitCode === 0 ? "✓" : "✗"}
            </Text>
            {"  "}exit {exitCode}
          </Text>
        ) : (
          <Text dimColor>↵ run · ↑↓ history · Esc close</Text>
        )}
      </Box>
      {output.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          {tail.map((line, i) => (
            <Text key={i}>{line || " "}</Text>
          ))}
          {lines.length > tail.length ? (
            <Text dimColor>… {lines.length - tail.length} earlier lines</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
