import React from "react";
import { Box, Text } from "ink";
import { PAGE_IDS, pageHotkey, pageLabel, type PageId } from "../ui-state.js";

type Props = {
  current: PageId;
};

export function TabBar({ current }: Props) {
  return (
    <Box flexDirection="row" flexWrap="wrap">
      <Text bold>amaco</Text>
      <Text>  </Text>
      {PAGE_IDS.map((id, i) => {
        const active = id === current;
        const hot = pageHotkey(id);
        const label = pageLabel(id);
        return (
          <React.Fragment key={id}>
            {i > 0 ? <Text dimColor>  ·  </Text> : null}
            <Text color={active ? "cyan" : undefined} dimColor={!active}>
              <Text bold={active}>
                {hot} {label}
              </Text>
            </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
