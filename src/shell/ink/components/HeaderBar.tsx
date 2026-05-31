import React from "react";
import { Box, Text } from "ink";
import { TabBar } from "./TabBar.js";
import { Rule } from "./Frame.js";
import { pageLabel, type PageId } from "../ui-state.js";
import { PAGE_META } from "../page-meta.js";
import { ACCENT, ACCENT_BRIGHT, PINK } from "../theme.js";
import type { StatusModel } from "../status-model.js";

/**
 * The top region: brand + "where am I" line (project · branch · activity) on
 * the title row, a divider, the numbered tab menu, then the page subtitle.
 */
export function HeaderBar({ model, page }: { model: StatusModel; page: PageId }) {
  const meta = PAGE_META[page];
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color={ACCENT_BRIGHT}>
          ⏵ vibestrate
        </Text>
        <Box flexGrow={1} />
        <Text>
          <Text dimColor>project </Text>
          <Text bold color={ACCENT}>{model.project}</Text>
          <Text dimColor>{"   ·   "}</Text>
          <Text dimColor>branch </Text>
          <Text color="white">{model.branch}</Text>
          {model.worktree ? <Text color={PINK}> ⑂</Text> : null}
          <Text dimColor>{"   ·   "}</Text>
          <Text color={model.busy ? ACCENT : "gray"}>{model.activity}</Text>
        </Text>
      </Box>
      <Rule />
      <TabBar current={page} />
      <Box>
        <Text bold>{pageLabel(page)}</Text>
        <Text dimColor>{"   ·   "}{meta.subtitle}</Text>
        <Box flexGrow={1} />
        <Text dimColor>? for help</Text>
      </Box>
    </Box>
  );
}
