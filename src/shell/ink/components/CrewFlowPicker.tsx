import React from "react";
import { Box, Text } from "ink";
import { FOCAL_CARD_PROPS } from "../theme.js";
import type { PickerItem } from "../ui-state.js";

/**
 * In-shell Crew / Flow selector overlay. ↑↓ move, ↵ select, Esc cancel.
 * The chosen id becomes the session default that seeds the next run.
 */
export function CrewFlowPicker({
  kind,
  items,
  index,
}: {
  kind: "crew" | "flow";
  items: PickerItem[];
  index: number;
}) {
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Text bold color="cyan">
        Select {kind}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {items.length === 0 ? (
          <Text dimColor>none available</Text>
        ) : (
          items.map((it, i) => (
            <Text key={it.id} color={i === index ? "cyan" : undefined} inverse={i === index}>
              {i === index ? "▌ " : "  "}
              {it.label}
              {it.label !== it.id ? <Text dimColor>{`  ${it.id}`}</Text> : null}
            </Text>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ move · ↵ select · Esc cancel</Text>
      </Box>
    </Box>
  );
}
