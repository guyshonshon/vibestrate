import React from "react";
import { Box, Text } from "ink";
import { PAGE_IDS, pageHotkey, pageLabel, type PageId } from "../ui-state.js";

type Props = {
  current: PageId;
};

/**
 * Pill-style tab bar. Active pill uses inverse video on cyan for
 * contrast; inactive pills are dimmed. Wide spacing so the eye can
 * locate the cursor without effort.
 */
export function TabBar({ current }: Props) {
  return (
    <Box flexDirection="row" flexWrap="wrap">
      <Text bold color="cyan">
        ⏵ amaco
      </Text>
      <Text>   </Text>
      {PAGE_IDS.map((id) => {
        const active = id === current;
        const hot = pageHotkey(id);
        const label = pageLabel(id);
        return (
          <React.Fragment key={id}>
            {active ? (
              <Text color="black" backgroundColor="cyan">
                {" "}
                {hot}·{label}
                {" "}
              </Text>
            ) : (
              <Text dimColor>
                {" "}
                {hot}·{label}
                {" "}
              </Text>
            )}
            <Text> </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
