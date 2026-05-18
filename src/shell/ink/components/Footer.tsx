import React from "react";
import { Box, Text } from "ink";
import type { ShellUiStateV2 } from "../ui-state.js";

export type KeyHint = { key: string; label: string };
export type HintGroup = { name: string; hints: KeyHint[] };

type Props = {
  ui: ShellUiStateV2;
  groups: HintGroup[];
  capturedAt: string | null;
};

/**
 * Contextual footer organised into named groups so the user can
 * scan by intent (Pages / Move / Actions / Misc). Each group lists
 * `key label` pairs; the key is cyan, the label dim.
 *
 * Toasts and pending y/N confirmations render under the keymap.
 */
export function Footer({ ui, groups, capturedAt }: Props) {
  const toast = ui.toasts[ui.toasts.length - 1] ?? null;
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap">
        <Text>
          {groups.map((g, gi) => (
            <React.Fragment key={g.name}>
              {gi > 0 ? <Text dimColor>   ·   </Text> : null}
              <Text dimColor>{g.name}: </Text>
              {g.hints.map((h, hi) => (
                <React.Fragment key={`${g.name}-${h.key}`}>
                  {hi > 0 ? <Text dimColor>  </Text> : null}
                  <Text color="cyan">{h.key}</Text>
                  <Text dimColor> {h.label}</Text>
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}
        </Text>
        <Box flexGrow={1} />
        {capturedAt ? <Text dimColor>{capturedAt.slice(11, 19)}</Text> : null}
      </Box>
      {ui.pendingConfirm?.action === "abort" ? (
        <Box marginTop={1}>
          <Text color="yellow">
            confirm abort of {ui.pendingConfirm.runId} — press{" "}
            <Text bold>y</Text> to confirm · any other key to cancel
          </Text>
        </Box>
      ) : null}
      {toast ? (
        <Box marginTop={1}>
          <Text
            color={
              toast.kind === "ok"
                ? "green"
                : toast.kind === "err"
                  ? "red"
                  : "cyan"
            }
          >
            {toast.kind === "ok" ? "✓" : toast.kind === "err" ? "✗" : "›"}
            {" "}
            {toast.message}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The Pages group is the same on every screen — kept here so the
 * App doesn't have to repeat it.
 */
export const PAGES_GROUP: HintGroup = {
  name: "Pages",
  hints: [
    { key: "1-9/0", label: "switch" },
    { key: "Esc", label: "back" },
    { key: ":", label: "palette" },
    { key: "!", label: "run amaco" },
    { key: "B", label: "open in browser" },
    { key: "?", label: "help" },
    { key: "q", label: "quit" },
  ],
};
