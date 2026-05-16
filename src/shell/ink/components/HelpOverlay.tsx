import React from "react";
import { Box, Text } from "ink";

export function HelpOverlay() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold>amaco panel — keybindings</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="cyan" bold>1-0</Text>
          <Text dimColor>   switch tabs (Dashboard, Runs, Roadmap, …)</Text>
        </Text>
        <Text>
          <Text color="cyan" bold>↑/↓ or k/j</Text>
          <Text dimColor>   move selection inside a list</Text>
        </Text>
        <Text>
          <Text color="cyan" bold>:</Text>
          <Text dimColor>   open the command palette</Text>
        </Text>
        <Text>
          <Text color="cyan" bold>p / r / a</Text>
          <Text dimColor>   pause / resume / abort the selected run (with y/N confirm for abort)</Text>
        </Text>
        <Text>
          <Text color="cyan" bold>?</Text>
          <Text dimColor>   toggle this help overlay</Text>
        </Text>
        <Text>
          <Text color="cyan" bold>q / Ctrl+C</Text>
          <Text dimColor>   quit</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>press ? again or Esc to close</Text>
      </Box>
    </Box>
  );
}
