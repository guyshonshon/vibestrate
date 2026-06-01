import React from "react";
import { Box, Text } from "ink";
import { ACCENT_DIM } from "../theme.js";

/**
 * A titled, rounded container - the building block for the shell's three
 * stacked regions (header · body · prompt). The border color is the region's
 * accent; an optional title sits on the first inner row. Colors accept Ink
 * names or hex (the violet ramp lives in theme.ts).
 */
export function Panel({
  borderColor = ACCENT_DIM,
  title,
  titleColor,
  children,
  flexGrow,
}: {
  borderColor?: string;
  title?: string;
  titleColor?: string;
  children: React.ReactNode;
  flexGrow?: number;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      flexGrow={flexGrow}
    >
      {title ? (
        <Text bold color={titleColor ?? borderColor}>
          {title}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}
