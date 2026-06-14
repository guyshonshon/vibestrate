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
  overflow,
  minHeight,
}: {
  borderColor?: string;
  title?: string;
  titleColor?: string;
  children: React.ReactNode;
  flexGrow?: number;
  /** "hidden" clips overflowing content instead of growing the box - used by
   *  the body region so it shrinks (clips) to make room for the completion
   *  list rather than pushing the layout past the viewport. */
  overflow?: "visible" | "hidden";
  /** Set to 0 alongside flexGrow so the box can actually shrink below its
   *  content height (Yoga won't shrink past content otherwise). */
  minHeight?: number;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      flexGrow={flexGrow}
      overflow={overflow}
      minHeight={minHeight}
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
