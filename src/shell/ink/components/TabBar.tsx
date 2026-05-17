import React from "react";
import { Box, Text } from "ink";
import { PAGE_IDS, pageHotkey, pageLabel, type PageId } from "../ui-state.js";

type Props = {
  current: PageId;
};

/**
 * Top label nav with visible numeric hotkeys: `[1] Dashboard …`.
 * The active page is highlighted in inverse-cyan so it's
 * impossible to miss; inactive pages are dim but readable. The
 * numbered prefix teaches the user how to switch pages without
 * having to consult the footer or help overlay.
 */
export function TabBar({ current }: Props) {
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {PAGE_IDS.map((id, i) => {
        const active = id === current;
        const hot = pageHotkey(id);
        const label = pageLabel(id);
        return (
          <React.Fragment key={id}>
            {i > 0 ? <Text dimColor>   </Text> : null}
            {active ? (
              <Text color="black" backgroundColor="cyan" bold>
                {" "}
                [{hot}] {label}
                {" "}
              </Text>
            ) : (
              <Text>
                <Text color="cyan">[{hot}]</Text>
                <Text dimColor> {label}</Text>
              </Text>
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
