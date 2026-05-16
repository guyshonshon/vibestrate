import React from "react";
import { Box, Text } from "ink";

type Props = {
  title: string;
  upcomingPhase: string;
};

export function PlaceholderPage({ title, upcomingPhase }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text dimColor>{title.toUpperCase()}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          This page lands in <Text bold>{upcomingPhase}</Text>.
        </Text>
        <Text dimColor>
          The Phase 1 foundation only ships the Runs view; tabs are wired so
          the whole structure is visible from day one.
        </Text>
      </Box>
    </Box>
  );
}
