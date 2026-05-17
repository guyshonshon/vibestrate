import React from "react";
import { Box, Text } from "ink";
import { pageLabel, type PageId } from "../ui-state.js";
import { PAGE_META } from "../page-meta.js";

type Props = {
  pageId: PageId;
};

/**
 * Renders below the TabBar — bold page name + dim subtitle that
 * tells the user, in human words, what this page is for. The
 * subtitle teaches the mental model (Task vs Run vs Queue etc.)
 * without forcing a help overlay.
 */
export function PageTitleBar({ pageId }: Props) {
  const meta = PAGE_META[pageId];
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{pageLabel(pageId)}</Text>
        <Text dimColor>   ·   {meta.subtitle}</Text>
        <Box flexGrow={1} />
        <Text dimColor>? for help</Text>
      </Box>
    </Box>
  );
}
