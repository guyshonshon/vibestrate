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
        <Text>
          {hints.map((h, i) => (
            <React.Fragment key={h.key}>
              {i > 0 ? <Text dimColor>   </Text> : null}
              <Text color="cyan">{h.key}</Text>
              <Text dimColor> {h.label}</Text>
            </React.Fragment>
          ))}
        </Text>
        <Box flexGrow={1} />
        {capturedAt ? (
          <Text dimColor>
            {capturedAt.slice(11, 19)}
          </Text>
        ) : null}
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

export const COMMON_HINTS: KeyHint[] = [
  { key: "1-0", label: "tabs" },
  { key: ":", label: "palette" },
  { key: "?", label: "help" },
  { key: "q", label: "quit" },
];
