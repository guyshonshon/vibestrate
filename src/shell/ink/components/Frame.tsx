import React from "react";
import { Box, Text, useStdout } from "ink";

type Props = {
  subtitle?: string | null;
  children: React.ReactNode;
};

// Cap the content column so the panel feels contained even on wide
// terminals — same posture as Claude CLI / gh / lazygit. Below ~80
// we let it fill the terminal so narrow shells aren't squeezed.
const MAX_WIDTH = 110;
const MIN_WIDTH = 70;

/**
 * One single rounded box wraps the whole panel. Inside the box we
 * stack: a header strip (title + subtitle), a thin separator, the
 * page content, another thin separator, and the footer. No nested
 * borders inside — content uses whitespace + dim section labels.
 */
export function Frame({ subtitle, children }: Props) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 100;
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, cols - 4));
  return (
    <Box flexDirection="row" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        width={width}
      >
        <Box>
          <Text bold color="cyan">
            ⏵ amaco
          </Text>
          <Box flexGrow={1} />
          {subtitle ? <Text dimColor>{subtitle}</Text> : null}
        </Box>
        <Box marginTop={1}>{children}</Box>
      </Box>
    </Box>
  );
}

/**
 * Thin horizontal separator used inside the Frame to divide nav,
 * content and footer. Sized to the inner width via useStdout so it
 * never overflows the rounded border.
 */
export function Rule() {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 100;
  const innerWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, cols - 4)) - 4;
  return <Text dimColor>{"─".repeat(innerWidth)}</Text>;
}
