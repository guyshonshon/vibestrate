import React from "react";
import { Box, Text } from "ink";
import { ACCENT_DIM } from "../theme.js";

type Props = {
  subtitle?: string | null;
  children: React.ReactNode;
};

/**
 * Outer "vibestrate" shell. Single rounded gray border wraps the whole
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
          ⏵ vibestrate
        </Text>
        <Box flexGrow={1} />
        {subtitle ? <Text dimColor>{subtitle}</Text> : null}
      </Box>
      <Box flexDirection="column">{children}</Box>
    </Box>
  );
}

/**
 * Horizontal separator that fills its panel's inner width on ANY terminal.
 * We overshoot the dash count and let Ink truncate it to the actual content
 * width (`wrap="truncate-end"`) - no `stdout.columns` math, so it can't end up
 * too short (ragged) or too long (wrapping onto the next row) when the terminal
 * is narrow, wide, resized, or a different emulator (PowerShell, etc.).
 */
export function Rule() {
  return (
    <Text color={ACCENT_DIM} wrap="truncate-end">
      {"─".repeat(400)}
    </Text>
  );
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
