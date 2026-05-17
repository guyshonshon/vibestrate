// Small reusable visual primitives: status pills, left selection
// bars, and uppercase section headers with a colored underline.
// Pulled out of the page files so the visual language stays
// consistent (and so we don't reach for raw color names from a
// dozen places).

import React from "react";
import { Box, Text } from "ink";
import type { Color, StatusToken } from "../theme.js";

/**
 * Compact pill — `▌ label`. The left bar is colored (status or
 * accent), the label inherits dim/normal. Inverse variant gets a
 * filled background and is used for the currently-active element.
 */
export function Pill({
  label,
  color,
  active = false,
  dim = false,
}: {
  label: string;
  color: Color;
  active?: boolean;
  dim?: boolean;
}) {
  if (active) {
    return (
      <Text color="black" backgroundColor={color ?? "cyan"} bold>
        {" "}
        {label}
        {" "}
      </Text>
    );
  }
  return (
    <Text>
      <Text color={color}>▌</Text>
      <Text dimColor={dim} bold={!dim}>
        {label}
      </Text>
    </Text>
  );
}

/**
 * A status pill that combines a status token with a small count.
 * Used by the Roadmap status rail and the Runs status badge.
 */
export function StatusPill({
  token,
  count,
  active,
}: {
  token: StatusToken;
  count?: number;
  active?: boolean;
}) {
  const label =
    typeof count === "number" ? `${token.label} ${count}` : token.label;
  if (active) {
    return (
      <Text color="black" backgroundColor={token.color ?? "cyan"} bold>
        {" "}
        {label}
        {" "}
      </Text>
    );
  }
  return (
    <Text>
      <Text color={token.color}>▌</Text>
      <Text dimColor>{token.label}</Text>
      {typeof count === "number" ? (
        <>
          <Text dimColor> </Text>
          <Text bold>{count}</Text>
        </>
      ) : null}
    </Text>
  );
}

/**
 * Strong section header: an uppercase title in cyan, then a thin
 * gray underline. Used to demarcate page-level sections inside the
 * Frame without resorting to nested borders.
 */
export function AccentHeader({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          {title.toUpperCase()}
        </Text>
        {hint ? <Text dimColor>     {hint}</Text> : null}
      </Box>
      <Text dimColor>{"═".repeat(title.length)}</Text>
    </Box>
  );
}

/**
 * Left selection bar — `▌ ` in cyan when selected, two spaces
 * otherwise. The bar produces a much stronger "this row is
 * active" cue than a small `›` glyph.
 */
export function SelectionMark({ selected }: { selected: boolean }) {
  if (selected) return <Text color="cyan" bold>▌ </Text>;
  return <Text>  </Text>;
}
