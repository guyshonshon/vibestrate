import React from "react";
import { Box, Text } from "ink";
import { FOCAL_CARD_PROPS } from "../theme.js";
import { pageLabel, type PageId } from "../ui-state.js";
import { PAGE_META } from "../page-meta.js";

const SECTIONS: Array<{ heading: string; entries: Array<[string, string]> }> = [
  {
    heading: "Navigation",
    entries: [
      ["1 – 0", "switch tabs (Dashboard, Roadmap, Queue, Runs, …)"],
      ["Esc", "back to the previously visited page"],
      ["↑ ↓  /  k j", "move selection in a list"],
      ["← →  /  h l", "switch column on the Roadmap board"],
      ["tab", "cycle inspector sections on the Runs page"],
      [":", "command palette"],
      ["!", "run any `vibe …` command and see the output"],
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
      ["R", "re-run as a fresh `vibe run` (preserves the original on disk)"],
    ],
  },
  {
    heading: "Roadmap actions",
    entries: [
      ["↵  /  r", "run selected task in the background"],
      ["n", "new task (form)"],
      ["e", "edit selected task"],
      ["d", "delete selected task (asks y / N)"],
      ["Q", "queue selected task"],
      ["c", "cycle a backlog task to ready"],
      ["D", "open description in $EDITOR"],
    ],
  },
];

type Props = {
  currentPage: PageId;
};

export function HelpOverlay({ currentPage }: Props) {
  const meta = PAGE_META[currentPage];
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Text bold>Keybindings · context</Text>
      <Text dimColor>vibestrate panel · press ? or Esc to close</Text>

      {/* Current-page context first — most likely what the user wants. */}
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Right now · {pageLabel(currentPage)}</Text>
        <Text>{meta.subtitle}</Text>
        <Box marginTop={1}>
          <Text dimColor>{meta.blurb}</Text>
        </Box>
        {meta.commonKeys && meta.commonKeys.length > 0 ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>page keys</Text>
            {meta.commonKeys.map(([k, label]) => (
              <Box key={k}>
                <Text>
                  <Text color="cyan">{k.padEnd(14)}</Text>
                  <Text dimColor>{label}</Text>
                </Text>
              </Box>
            ))}
          </Box>
        ) : null}
        {meta.commonCli && meta.commonCli.length > 0 ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>cli equivalents</Text>
            {meta.commonCli.map((line, i) => (
              <Text key={i}>
                <Text dimColor>  $ </Text>
                <Text>{line}</Text>
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>

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
