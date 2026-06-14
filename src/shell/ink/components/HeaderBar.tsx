import React from "react";
import { Box, Text } from "ink";
import { TabBar } from "./TabBar.js";
import { Rule } from "./Frame.js";
import { pageLabel, type PageId } from "../ui-state.js";
import { PAGE_META } from "../page-meta.js";
import { ACCENT, ACCENT_BRIGHT, PINK } from "../theme.js";
import type { StatusModel } from "../status-model.js";

/**
 * The top region - deliberately light: brand + "where am I" (project · branch ·
 * activity), a divider, the numbered tab menu, then the page subtitle with a
 * minimal command hint. The full keymap lives in the `?` help overlay rather
 * than a persistent wall of keys.
 */
export function HeaderBar({ model, page }: { model: StatusModel; page: PageId }) {
  const meta = PAGE_META[page];
  return (
    <Box flexDirection="column">
      <Box overflow="hidden">
        <Text bold color={ACCENT_BRIGHT} wrap="truncate-end">
          ⏵ vibestrate
        </Text>
        <Box flexGrow={1} />
        {/* truncate-start: when the terminal is narrow, keep the most useful
            tail (branch · activity) instead of wrapping it onto the divider. */}
        <Text wrap="truncate-start">
          <Text bold color={ACCENT}>{model.project}</Text>
          <Text dimColor>{"  ·  "}</Text>
          <Text color="white">{model.branch}</Text>
          {model.worktree ? <Text color={PINK}> ⑂</Text> : null}
          <Text dimColor>{"  ·  "}</Text>
          <Text color={model.busy ? ACCENT : "gray"}>{model.activity}</Text>
        </Text>
      </Box>
      <Rule />
      <TabBar current={page} />
      <Box overflow="hidden">
        <Text dimColor wrap="truncate-end">{meta.subtitle}</Text>
        <Box flexGrow={1} />
        <Text wrap="truncate-start">
          <Text color={ACCENT}>:</Text>
          <Text dimColor> commands</Text>
          <Text dimColor>{"   "}</Text>
          <Text color={ACCENT}>?</Text>
          <Text dimColor> help</Text>
          <Text dimColor>{"   "}</Text>
          <Text color={ACCENT}>q</Text>
          <Text dimColor> quit</Text>
        </Text>
      </Box>
    </Box>
  );
}
