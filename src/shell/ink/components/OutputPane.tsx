import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { windowFromBottom } from "../output-window.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { ACCENT, ACCENT_BRIGHT, ACCENT_DIM } from "../theme.js";

/**
 * Command-output pane. Two modes:
 *  - compact (default): the ~26%-wide right column, lines **truncated** to one
 *    row each so a big dump (e.g. `config show`) can't balloon the panel past
 *    the screen height.
 *  - full: a full-width readable view (`O`) where lines wrap, for actually
 *    reading verbose output.
 * Both follow the tail and scroll with Tab / Shift+Tab.
 */
export function OutputPane({
  output,
  running,
  exitCode,
  scroll,
  full = false,
}: {
  output: string;
  running: boolean;
  exitCode: number | null;
  scroll: number;
  full?: boolean;
}) {
  const { rows } = useTerminalSize();
  // Strictly bound the height so the panel never exceeds the viewport.
  const height = Math.max(4, rows - (full ? 9 : 18));
  const lines = output.split(/\r?\n/);
  const win = windowFromBottom(lines, scroll, height);
  return (
    <Box
      flexDirection="column"
      width={full ? "100%" : "26%"}
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
        <Box flexGrow={1} />
        <Text dimColor>{full ? "O collapse · Esc" : "O expand"}</Text>
      </Box>
      {win.above > 0 ? <Text dimColor>↑ {win.above} more · ⇧⇥</Text> : null}
      {win.lines.map((line, i) => (
        // Truncate in the narrow pane (height-safe); wrap when full (readable).
        <Text key={i} wrap={full ? "wrap" : "truncate-end"}>
          {line || " "}
        </Text>
      ))}
      {win.below > 0 ? (
        <Text dimColor>↓ {win.below} more · ⇥</Text>
      ) : !full && lines.length > height ? (
        <Text dimColor>
          press <Text color={ACCENT}>O</Text> to read full
        </Text>
      ) : null}
    </Box>
  );
}
