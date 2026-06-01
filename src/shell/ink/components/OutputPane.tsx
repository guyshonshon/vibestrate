import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { windowFromBottom } from "../output-window.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { ACCENT_BRIGHT, ACCENT_DIM } from "../theme.js";

/**
 * The right-hand command-output pane (~30% width) — where a prompt command's
 * stdout lands instead of cramming the bottom prompt. Scrollable: it follows
 * the tail, and PgUp/PgDn walk back through earlier lines.
 */
export function OutputPane({
  output,
  running,
  exitCode,
  scroll,
}: {
  output: string;
  running: boolean;
  exitCode: number | null;
  scroll: number;
}) {
  const { rows } = useTerminalSize();
  const height = Math.max(4, rows - 18);
  const lines = output.split(/\r?\n/);
  const win = windowFromBottom(lines, scroll, height);
  return (
    <Box
      flexDirection="column"
      width="32%"
      borderStyle="single"
      borderColor={ACCENT_DIM}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
    >
      <Box>
        <Text bold color={ACCENT_BRIGHT}>
          OUTPUT
        </Text>
        {running ? (
          <Text dimColor>
            {"   "}
            <Spinner type="dots" /> running…
          </Text>
        ) : exitCode !== null ? (
          <Text dimColor>
            {"   "}
            <Text color={exitCode === 0 ? "green" : "red"}>
              {exitCode === 0 ? "✓" : "✗"}
            </Text>{" "}
            exit {exitCode}
          </Text>
        ) : null}
      </Box>
      {win.above > 0 ? <Text dimColor>↑ {win.above} more · PgUp</Text> : null}
      {win.lines.map((line, i) => (
        <Text key={i}>{line || " "}</Text>
      ))}
      {win.below > 0 ? <Text dimColor>↓ {win.below} more · PgDn</Text> : null}
    </Box>
  );
}
