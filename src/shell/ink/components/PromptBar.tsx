import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { ACCENT } from "../theme.js";

type Props = {
  input: string;
  running: boolean;
  exitCode: number | null;
  focused: boolean;
  hasOutput: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
};

/**
 * The always-visible bottom prompt — the Claude-Code-style command line for
 * the shell. Type a `vibe …` command and Enter to run it; `:` opens the
 * palette. When unfocused it shows a hint and the hotkeys stay live; press
 * `i` to focus, Esc to return to navigation. Command output streams into the
 * right-hand OutputPane, not here.
 */
export function PromptBar({
  input,
  running,
  exitCode,
  focused,
  hasOutput,
  onChange,
  onSubmit,
}: Props) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={focused ? ACCENT : "gray"} bold>
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
          <Text dimColor>
            {input || 'press i to run a new task — e.g. run "add dark mode"'}
          </Text>
        )}
      </Box>
      {running ? (
        <Box>
          <Text dimColor>
            <Spinner type="dots" /> <Text>running…</Text>
          </Text>
        </Box>
      ) : exitCode !== null ? (
        <Box>
          <Text dimColor>
            <Text color={exitCode === 0 ? "green" : "red"}>
              {exitCode === 0 ? "✓" : "✗"}
            </Text>
            {"  "}exit {exitCode}
            {focused ? (
              <Text>
                {"   ↵ run · ↑↓ history"}
                {hasOutput ? " · ⇥/⇧⇥ scroll output" : ""} · Esc done
              </Text>
            ) : null}
          </Text>
        </Box>
      ) : focused ? (
        <Box>
          <Text dimColor>
            ↵ run · ↑↓ history{hasOutput ? " · ⇥/⇧⇥ scroll output" : ""} · :
            palette · Esc done
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
