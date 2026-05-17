import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import {
  DEFAULT_PALETTE,
  filterPalette,
  type PaletteCommand,
} from "../palette.js";
import { FOCAL_CARD_PROPS } from "../theme.js";

type Props = {
  query: string;
  onChange: (q: string) => void;
  onSubmit: (cmd: PaletteCommand | null) => void;
  onCancel: () => void;
};

export function CommandPalette({
  query,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const matches = filterPalette(DEFAULT_PALETTE, query, 8);
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Box>
        <Text color="cyan" bold>
          ›{" "}
        </Text>
        <TextInput
          value={query}
          onChange={onChange}
          onSubmit={() => onSubmit(matches[0] ?? null)}
          placeholder="search commands…"
        />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {matches.length === 0 ? (
          <Text dimColor>no match</Text>
        ) : (
          matches.map((m, i) => (
            <Box key={m.id}>
              <Text>
                <Text color={i === 0 ? "cyan" : undefined}>
                  {i === 0 ? "  ▸ " : "    "}
                </Text>
                <Text bold={i === 0}>{m.title}</Text>
                {m.hint ? <Text dimColor>   {m.hint}</Text> : null}
              </Text>
            </Box>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          <Text color="cyan">↵</Text> run · <Text color="cyan">Esc</Text> cancel
        </Text>
      </Box>
    </Box>
  );
  void onCancel;
}
