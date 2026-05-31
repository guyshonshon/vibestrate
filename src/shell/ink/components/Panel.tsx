import React from "react";
import { Box, Text } from "ink";
import type { Color } from "../theme.js";

/**
 * A titled, rounded container — the building block for the shell's three
 * stacked regions (header · body · prompt). The border color is the region's
 * accent; an optional title sits on the first inner row.
 */
export function Panel({
  borderColor = "gray",
  title,
  titleColor,
  children,
  flexGrow,
}: {
  borderColor?: Color;
  title?: string;
  titleColor?: Color;
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
