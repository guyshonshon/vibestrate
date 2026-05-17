import React from "react";
import { Box, Text } from "ink";
import { FOCAL_CARD_PROPS } from "../theme.js";

const SECTIONS: Array<{ heading: string; entries: Array<[string, string]> }> = [
  {
    heading: "Navigation",
    entries: [
      ["1 – 0", "switch tabs (Dashboard, Runs, Roadmap, …)"],
      ["Esc", "back to the previously visited page"],
      ["↑ ↓  /  k j", "move selection in a list"],
      ["← →  /  h l", "switch column on the Roadmap board"],
      ["tab", "cycle inspector sections on the Runs page"],
      [":", "command palette"],
      ["!", "run any `amaco …` command and see the output"],
      ["/", "filter the events list"],
      ["?", "toggle this help"],
    ],
  },
  {
    heading: "Run actions",
    entries: [
      ["p", "pause the selected run"],
      ["r", "resume the selected run"],
      ["a", "abort the selected run (asks y / N)"],
    ],
  },
  {
    heading: "Roadmap actions",
    entries: [
      ["n", "new task (form)"],
      ["e", "edit selected task"],
      ["d", "delete selected task (asks y / N)"],
      ["Q", "queue selected task"],
      ["c", "cycle a backlog task to ready"],
      ["D", "open description in $EDITOR"],
    ],
  },
];

export function HelpOverlay() {
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Text bold>Keybindings</Text>
      <Text dimColor>amaco panel · press ? or Esc to close</Text>
      {SECTIONS.map((section) => (
        <Box key={section.heading} flexDirection="column" marginTop={1}>
          <Text color="cyan">{section.heading}</Text>
          {section.entries.map(([key, label]) => (
            <Box key={key}>
              <Text>
                <Text color="cyan">{key.padEnd(14)}</Text>
                <Text dimColor>{label}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
