import React from "react";
import { Box, Text, useStdout } from "ink";

type Props = {
  subtitle?: string | null;
  children: React.ReactNode;
};

/**
 * One rounded outer box wraps the whole panel — that's where the
 * "contained" feel comes from. We deliberately let the box fill the
 * terminal width so content has room to breathe; capping the width
 * was tried first but caused text to wrap one-word-per-line at
 * common 100-col terminals.
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
 * Thin horizontal separator used inside the Frame to divide nav,
 * content and footer. Sized to the inner terminal width so it
 * never overflows the rounded border.
 */
export function Rule() {
  const { stdout } = useStdout();
  // Frame eats 4 cols (2 padding + 2 border). Subtract a small
  // safety margin so the rule never bumps against the right border.
  const cols = Math.max(20, (stdout?.columns ?? 80) - 6);
  return <Text dimColor>{"─".repeat(cols)}</Text>;
}
