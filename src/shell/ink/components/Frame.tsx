import React from "react";
import { Box, Text, useStdout } from "ink";

type Props = {
  subtitle?: string | null;
  children: React.ReactNode;
};

/**
 * Outer "amaco" shell. One rounded gray border wraps the entire
 * panel; the inside is plain padding + dim section labels so the
 * UI reads as a single contained surface, not a stack of boxes.
 *
 * The Frame fills the terminal width to avoid the one-word-per-line
 * wrap we hit when we tried a fixed content column.
 */
export function Frame({ subtitle, children }: Props) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
    >
      <Box>
        <Text bold color="cyan">
          ⏵ amaco
        </Text>
        <Box flexGrow={1} />
        {subtitle ? <Text dimColor>{subtitle}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

/**
 * Horizontal separator sized to the inner width of the Frame.
 * Reads the live terminal columns each render so it adapts when
 * the user resizes their window.
 */
export function Rule() {
  const { stdout } = useStdout();
  const cols = Math.max(20, (stdout?.columns ?? 80) - 6);
  return <Text dimColor>{"─".repeat(cols)}</Text>;
}

/**
 * Section heading used between Rule()s. Bold cyan title with an
 * optional dim subtitle to its right.
 */
export function SectionHeader({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <Box>
      <Text bold color="cyan">
        {title}
      </Text>
      {hint ? <Text dimColor>   {hint}</Text> : null}
    </Box>
  );
}
