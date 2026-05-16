import React from "react";
import { Box, Text } from "ink";
import { CARD_PROPS } from "../theme.js";

type Props = {
  title: string;
  upcomingPhase: string;
};

export function PlaceholderPage({ title, upcomingPhase }: Props) {
  return (
    <Box {...CARD_PROPS} flexDirection="column">
      <Text dimColor>{title.toLowerCase()}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          this page lands in <Text color="cyan">{upcomingPhase}</Text>
        </Text>
        <Text dimColor>
          the foundation already wires the tab into the router — content is
          coming.
        </Text>
      </Box>
    </Box>
  );
}
