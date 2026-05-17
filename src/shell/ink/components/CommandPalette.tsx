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
  selectedIndex: number;
  onChange: (q: string) => void;
  onSubmit: (cmd: PaletteCommand | null) => void;
  onCancel: () => void;
};

const PALETTE_LIMIT = 8;

/**
 * Exposed so the App's input handler can clamp `selectedIndex` to
 * the same list size the view renders.
 */
export function paletteMatches(query: string): PaletteCommand[] {
  return filterPalette(DEFAULT_PALETTE, query, PALETTE_LIMIT);
}

export function CommandPalette({
  query,
  selectedIndex,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const matches = paletteMatches(query);
  const idx = Math.max(0, Math.min(matches.length - 1, selectedIndex));
  const focused = matches[idx] ?? null;
  return (
    <Box {...FOCAL_CARD_PROPS} flexDirection="column">
      <Box>
        <Text color="cyan" bold>
          ›{" "}
        </Text>
        <TextInput
          value={query}
          onChange={onChange}
          onSubmit={() => onSubmit(focused)}
          placeholder="search commands…"
        />
      </Box>
      <Box marginTop={1} flexDirection="row">
        {/* Left: matches list */}
        <Box flexDirection="column" minWidth={36}>
          {matches.length === 0 ? (
            <Text dimColor>no match</Text>
          ) : (
            matches.map((m, i) => {
              const active = i === idx;
              return (
                <Box key={m.id}>
                  <Text>
                    <Text color={active ? "cyan" : undefined}>
                      {active ? "▌ " : "  "}
                    </Text>
                    <Text bold={active}>{m.title}</Text>
                    {m.hint ? (
                      <Text dimColor>   {m.hint}</Text>
                    ) : null}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>
        {/* Right: details for the highlighted command */}
        {focused ? (
          <Box
            flexDirection="column"
            marginLeft={2}
            paddingLeft={2}
            flexGrow={1}
          >
            <Text bold color="cyan">
              {focused.title}
            </Text>
            {focused.description ? (
              <Text dimColor>{focused.description}</Text>
            ) : null}
            {focused.cli ? (
              <Box marginTop={1}>
                <Text>
                  <Text dimColor>cli  </Text>
                  <Text>{focused.cli}</Text>
                </Text>
              </Box>
            ) : null}
            {focused.examples && focused.examples.length > 0 ? (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>examples</Text>
                {focused.examples.map((ex, i) => (
                  <Text key={i}>
                    <Text dimColor>  $ </Text>
                    <Text>{ex}</Text>
                  </Text>
                ))}
              </Box>
            ) : null}
            {focused.keywords && focused.keywords.length > 0 ? (
              <Box marginTop={1}>
                <Text dimColor>
                  keywords  {focused.keywords.join(", ")}
                </Text>
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          <Text color="cyan">↑↓</Text> select · <Text color="cyan">↵</Text> run
          · <Text color="cyan">Esc</Text> cancel
        </Text>
      </Box>
    </Box>
  );
  void onCancel;
}
