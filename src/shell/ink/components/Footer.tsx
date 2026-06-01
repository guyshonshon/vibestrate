import React from "react";
import { Box, Text } from "ink";
import type { ShellUiStateV2 } from "../ui-state.js";

export type KeyHint = { key: string; label: string };
export type HintGroup = { name: string; hints: KeyHint[] };

type Props = {
  ui: ShellUiStateV2;
  capturedAt: string | null;
};

/**
 * The slim bottom strip: transient toasts + pending y/N confirmations, and the
 * snapshot clock right-aligned. (The command keymap now lives up in the header
 * as a minimal hint; the full list is in the `?` overlay.)
 */
export function Footer({ ui, capturedAt }: Props) {
  const toast = ui.toasts[ui.toasts.length - 1] ?? null;
  return (
    <Box flexDirection="column">
      <Box>
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
    { key: "i", label: "prompt" },
    { key: ":", label: "palette" },
    { key: "m", label: "mode" },
    { key: "c/f", label: "crew/flow" },
    { key: "d", label: "docs" },
    { key: "B", label: "browser" },
    { key: "?", label: "help" },
    { key: "q", label: "quit" },
  ],
};
