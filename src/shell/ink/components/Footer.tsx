import React from "react";
import { Box, Text } from "ink";
import type { ShellUiStateV2 } from "../ui-state.js";

type KeyHint = { key: string; label: string };

type Props = {
  ui: ShellUiStateV2;
  hints: KeyHint[];
  capturedAt: string | null;
};

export function Footer({ ui, hints, capturedAt }: Props) {
  const toast = ui.toasts[ui.toasts.length - 1] ?? null;
  return (
    <Box flexDirection="column">
      <Box>
        {hints.map((h, i) => (
          <React.Fragment key={h.key}>
            {i > 0 ? <Text dimColor>   </Text> : null}
            <Text color="cyan" bold>
              {h.key}
            </Text>
            <Text dimColor> {h.label}</Text>
          </React.Fragment>
        ))}
        <Box flexGrow={1} />
        {capturedAt ? (
          <Text dimColor>{capturedAt.slice(11, 19)}</Text>
        ) : null}
      </Box>
      {ui.pendingConfirm?.action === "abort" ? (
        <Text color="yellow">
          confirm abort of {ui.pendingConfirm.runId}? press y to confirm, any
          other key to cancel.
        </Text>
      ) : null}
      {toast ? (
        <Text
          color={
            toast.kind === "ok"
              ? "green"
              : toast.kind === "err"
                ? "red"
                : "cyan"
          }
        >
          {toast.message}
        </Text>
      ) : null}
    </Box>
  );
}

export const COMMON_HINTS: KeyHint[] = [
  { key: "1-0", label: "tabs" },
  { key: ":", label: "palette" },
  { key: "?", label: "help" },
  { key: "q", label: "quit" },
];
