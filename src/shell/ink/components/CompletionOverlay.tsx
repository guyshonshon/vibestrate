import React from "react";
import { Box, Text } from "ink";
import type { CompletionItem } from "../completion.js";
import { windowFromTop } from "../output-window.js";
import { ACCENT, ACCENT_DIM } from "../theme.js";

const MAX_VISIBLE = 6;

/** The most rows this overlay can ever render: the visible window + the two
 *  "↑/↓ N more" markers + the selected-item detail line + the key-hint line.
 *  App reserves exactly this many rows below the prompt (the constant completion
 *  strip) so the list filling/emptying as you type never changes the layout. */
export const COMPLETION_SLOT_ROWS = MAX_VISIBLE + 4;

/**
 * Ghost completion list rendered directly under the prompt. Shows the
 * candidate subcommands / flags for the token being typed, the selected one
 * highlighted. Tab accepts, arrows move, Esc dismisses (handled by App).
 */
export function CompletionOverlay({
  items,
  selectedIndex,
}: {
  items: CompletionItem[];
  selectedIndex: number;
}) {
  if (items.length === 0) return null;
  const sel = Math.max(0, Math.min(items.length - 1, selectedIndex));
  // Keep the selected row inside a small window so a long candidate list
  // never grows the prompt panel past a few rows.
  const scroll = Math.max(0, Math.min(sel - Math.floor(MAX_VISIBLE / 2), items.length - MAX_VISIBLE));
  const win = windowFromTop(items, scroll, MAX_VISIBLE);
  // Pad to the widest VISIBLE row (capped), not the widest of the whole list -
  // one long off-screen candidate shouldn't blow the layout wide and push every
  // description off the right edge (avoid "autocomplete truncates").
  const width = Math.min(
    36,
    win.lines.reduce((m, it) => Math.max(m, it.value.length), 0),
  );

  return (
    <Box flexDirection="column" marginTop={0}>
      {win.above > 0 ? <Text dimColor>{`  ↑ ${win.above} more`}</Text> : null}
      {win.lines.map((item) => {
        const i = items.indexOf(item);
        const active = i === sel;
        return (
          <Text key={item.value} wrap="truncate-end">
            <Text color={active ? ACCENT : ACCENT_DIM}>{active ? "› " : "  "}</Text>
            <Text bold={active} color={active ? ACCENT : undefined}>
              {item.value.padEnd(width)}
            </Text>
            {item.description ? (
              <Text dimColor>{`  ${item.description}`}</Text>
            ) : null}
          </Text>
        );
      })}
      {win.below > 0 ? <Text dimColor>{`  ↓ ${win.below} more`}</Text> : null}
      {items[sel]?.detail ? (
        <Text color={ACCENT_DIM} wrap="truncate-end">{`  ${items[sel]!.detail}`}</Text>
      ) : null}
      <Text dimColor>{"  ⇥ complete · ↑↓ select · esc dismiss"}</Text>
    </Box>
  );
}
