import React from "react";
import { Box, Text } from "ink";
import { PAGE_IDS, pageHotkey, pageLabel, type PageId } from "../ui-state.js";
import { ACCENT, ACCENT_BRIGHT } from "../theme.js";

type Props = {
  current: PageId;
};

/**
 * Top label nav with visible numeric hotkeys: `[1] Dashboard …`.
 * The active page is highlighted in inverse-violet so it's
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
              <Text color="black" backgroundColor={ACCENT} bold>
                {" "}
                {hot ? `[${hot}] ` : ""}
                {label}
                {" "}
              </Text>
            ) : hot ? (
              <Text>
                <Text color={ACCENT_BRIGHT}>[{hot}]</Text>
                <Text dimColor> {label}</Text>
              </Text>
            ) : (
              <Text dimColor> {label}</Text>
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
