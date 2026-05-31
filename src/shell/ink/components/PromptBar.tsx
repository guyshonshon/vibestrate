import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";

type Props = {
  input: string;
  output: string;
  running: boolean;
  exitCode: number | null;
  focused: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
};

/**
 * The always-visible bottom prompt — the Claude-Code-style command line for
 * the shell. Type a `vibe …` command and Enter to run it; `:` opens the
 * palette. When unfocused it shows a hint and the hotkeys stay live; press
 * `/` (or `i`) to focus, Esc to return to navigation. The last command's
 * output tail is shown while focused or running.
 */
export function PromptBar({
  input,
  output,
  running,
  exitCode,
  focused,
  onChange,
  onSubmit,
}: Props) {
  const lines = output.split(/\r?\n/);
  const tail = lines.slice(-10);
  const showOutput = (focused || running) && output.length > 0;
  return (
    <Box flexDirection="column">
      {showOutput ? (
        <Box flexDirection="column" marginBottom={1}>
          {tail.map((line, i) => (
            <Text key={i} dimColor>
              {line || " "}
            </Text>
          ))}
          {lines.length > tail.length ? (
            <Text dimColor>… {lines.length - tail.length} earlier lines</Text>
          ) : null}
        </Box>
      ) : null}
      <Box>
        <Text color={focused ? "cyan" : "gray"} bold>
          {"▸ vibe "}
        </Text>
        {focused ? (
          <TextInput
            value={input}
            onChange={onChange}
            onSubmit={onSubmit}
            focus={focused}
            placeholder='run "add dark mode"   ·   status   ·   tasks list'
          />
        ) : (
          <Text dimColor>{input || "press / to type a command"}</Text>
        )}
      </Box>
      <Box>
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
            {focused ? <Text>{"   ↵ run · ↑↓ history · Esc done"}</Text> : null}
          </Text>
        ) : focused ? (
          <Text dimColor>↵ run · ↑↓ history · : palette · Esc done</Text>
        ) : (
          <Text dimColor>/ command · : palette · ? help · q quit</Text>
        )}
      </Box>
    </Box>
  );
}
