import React from "react";
import { Box, Text } from "ink";
import { PAGE_IDS, pageHotkey, pageLabel, type PageId } from "../ui-state.js";
import { ACCENT, ACCENT_BRIGHT } from "../theme.js";
import { useTerminalWidth } from "../hooks/useTerminalWidth.js";

type Props = {
  current: PageId;
  /** Test-only width override; defaults to the live terminal width. */
  width?: number;
};

/** Below this width the full label row wraps onto several lines, so we collapse
 *  to numeric hotkeys instead (only the active page keeps its label). */
const COMPACT_BELOW_COLS = 80;

/**
 * Top label nav with visible numeric hotkeys: `[1] Dashboard …`.
 * The active page is highlighted in inverse-violet so it's
 * impossible to miss; inactive pages are dim but readable. The
 * numbered prefix teaches the user how to switch pages without
 * having to consult the footer or help overlay.
 *
 * On a narrow terminal (< 80 cols) the full label set wraps across several
 * rows, so we render a single-row compact mode: numeric hotkeys only, with
 * just the active page labelled.
 */
export function TabBar({ current, width }: Props) {
  const measured = useTerminalWidth();
  const compact = (width ?? measured) < COMPACT_BELOW_COLS;

  if (compact) {
    return (
      <Box flexDirection="row">
        {PAGE_IDS.map((id, i) => {
          const active = id === current;
          const hot = pageHotkey(id);
          return (
            <React.Fragment key={id}>
              {i > 0 ? <Text dimColor> </Text> : null}
              {active ? (
                <Text color="black" backgroundColor={ACCENT} bold>
                  {" "}
                  {hot ? `[${hot}] ` : ""}
                  {pageLabel(id)}
                  {" "}
                </Text>
              ) : (
                <Text color={ACCENT_BRIGHT}>{hot || "·"}</Text>
              )}
            </React.Fragment>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="row" flexWrap="wrap">
      {PAGE_IDS.map((id, i) => {
        const active = id === current;
        const hot = pageHotkey(id);
        const label = pageLabel(id);
        return (
          <React.Fragment key={id}>
            {i > 0 ? <Text dimColor>   </Text> : null}
            {active ? (
              <Text color="black" backgroundColor={ACCENT} bold>
                {" "}
                {hot ? `[${hot}] ` : ""}
                {label}
                {" "}
              </Text>
            ) : hot ? (
              <Text>
                <Text color={ACCENT_BRIGHT}>[{hot}]</Text>
                <Text dimColor> {label}</Text>
              </Text>
            ) : (
              <Text dimColor> {label}</Text>
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
