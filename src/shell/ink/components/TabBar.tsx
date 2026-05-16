import React from "react";
import { Box, Text, useStdout } from "ink";
import { PAGE_IDS, pageLabel, type PageId } from "../ui-state.js";

type Props = {
  current: PageId;
};

/**
 * Top label nav. Each page renders its name; the active one is
 * cyan + bold with a ▸ prefix, the rest are dim. A full-width
 * separator underneath visually nails the nav to the page chrome.
 *
 * Number hotkeys (1-0) aren't shown on every label to keep the
 * surface calm — the footer carries them, and the help overlay
 * spells out the full keymap.
 */
export function TabBar({ current }: Props) {
  const { stdout } = useStdout();
  const cols = Math.max(40, (stdout?.columns ?? 100) - 4);
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap">
        {PAGE_IDS.map((id, i) => {
          const active = id === current;
          const label = pageLabel(id);
          return (
            <React.Fragment key={id}>
              {i > 0 ? <Text dimColor>    </Text> : null}
              {active ? (
                <Text color="cyan" bold>
                  ▸ {label}
                </Text>
              ) : (
                <Text dimColor>  {label}</Text>
              )}
            </React.Fragment>
          );
        })}
      </Box>
      <Text dimColor>{"─".repeat(cols)}</Text>
    </Box>
  );
}
