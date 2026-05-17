import React from "react";
import { Box, Text } from "ink";
import { PAGE_IDS, pageLabel, type PageId } from "../ui-state.js";

type Props = {
  current: PageId;
};

/**
 * Top label nav. Each page name is rendered; the active one is
 * cyan + bold with a ▸ prefix, the rest dim. No separators drawn
 * here — the surrounding Frame handles the rule below.
 */
export function TabBar({ current }: Props) {
  return (
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
  );
}
