import React from "react";
import { Box, Text, useStdout } from "ink";

type Props = {
  subtitle?: string | null;
  children: React.ReactNode;
};

/**
 * Outer "amaco" shell. Single rounded gray border wraps the whole
 * panel. Padding is intentionally tight (paddingX 2, paddingY 0) so
 * even a short VS-Code terminal pane keeps the header + nav + footer
 * all visible at once.
 */
export function Frame({ subtitle, children }: Props) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
    >
      <Box>
        <Text bold color="cyan">
          ⏵ amaco
        </Text>
        <Box flexGrow={1} />
        {subtitle ? <Text dimColor>{subtitle}</Text> : null}
      </Box>
      <Box flexDirection="column">{children}</Box>
    </Box>
  );
}

/**
 * Horizontal separator sized to the inner terminal width. We use it
 * sparingly now — one rule between TabBar and content is enough; a
 * second between content and footer just eats vertical space.
 */
export function Rule() {
  const { stdout } = useStdout();
  const cols = Math.max(20, (stdout?.columns ?? 80) - 6);
  return <Text dimColor>{"─".repeat(cols)}</Text>;
}

/**
 * Section heading: bold cyan title, optional dim hint after it.
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
