import React from "react";
import { Box, Text } from "ink";
import { keymapForPage } from "../keymaps.js";
import { PAGES_GROUP } from "./Footer.js";
import { ACCENT, ACCENT_BRIGHT, ACCENT_DIM } from "../theme.js";
import type { PageId } from "../ui-state.js";

/**
 * The right-hand command reference for the current page - so every window
 * shows what you can do without consulting `?`. Lists the page's own actions
 * (from keymaps.ts) plus the always-available global keys. Shown when there's
 * no command output occupying the pane.
 */
export function ActionsPanel({ page }: { page: PageId }) {
  const groups = [...keymapForPage(page), PAGES_GROUP];
  return (
    <Box
      flexDirection="column"
      width="24%"
      borderStyle="single"
      borderColor={ACCENT_DIM}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
    >
      <Text bold color={ACCENT_BRIGHT}>
        COMMANDS
      </Text>
      {groups.map((g) => (
        <Box key={g.name} flexDirection="column" marginTop={1}>
          <Text dimColor>{g.name}</Text>
          {g.hints.map((h) => (
            <Text key={h.key} wrap="truncate-end">
              {"  "}
              <Text color={ACCENT}>{h.key.padEnd(6)}</Text>
              <Text dimColor>{h.label}</Text>
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}
