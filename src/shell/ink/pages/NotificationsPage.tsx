import React from "react";
import { Box, Text, useInput } from "ink";
import type {
  Notification,
  GatewaysFile,
} from "../../../notifications/notification-types.js";
import { clip, timeAgo } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";

type Props = {
  items: Notification[];
  gateways: GatewaysFile;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

export function NotificationsPage({
  items,
  gateways,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const sorted = [...items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const idx = Math.max(0, Math.min(sorted.length - 1, selectedIndex));
  const selected = sorted[idx] ?? null;

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(sorted.length - 1, idx + 1));
      }
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        NOTIFICATIONS
        <Text dimColor>   ({sorted.length})</Text>
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>gateways</Text>
        <GatewayStrip gateways={gateways} />
      </Box>

      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column" minWidth={40}>
          {sorted.length === 0 ? (
            <Text dimColor>no notifications yet</Text>
          ) : (
            sorted.slice(0, 12).map((n, i) => (
              <Box key={n.id}>
                <SelectionMark selected={i === idx} />
                <Text>
                  <Text color={severityColor(n.severity)}>{severityGlyph(n.severity)}</Text>
                  <Text bold={i === idx}>  {clip(n.title, 30).padEnd(30)}</Text>
                  <Text dimColor>  {timeAgo(n.createdAt).padStart(7)}</Text>
                </Text>
              </Box>
            ))
          )}
          {sorted.length > 12 ? (
            <Text dimColor>+ {sorted.length - 12} more</Text>
          ) : null}
        </Box>
        {selected ? (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="cyan">
              {selected.title}
            </Text>
            <Box marginTop={1} flexDirection="column">
              <KV
                label="severity"
                value={selected.severity}
                tint={severityColor(selected.severity)}
              />
              <KV label="category" value={selected.category} />
              {selected.runId ? <KV label="run" value={selected.runId} /> : null}
              {selected.taskId ? <KV label="task" value={selected.taskId} /> : null}
              <KV label="created" value={selected.createdAt} />
            </Box>
            {selected.message ? (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>message</Text>
                {selected.message
                  .split("\n")
                  .slice(0, 8)
                  .map((line: string, i: number) => (
                    <Text key={i}>{clip(line, 80)}</Text>
                  ))}
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function GatewayStrip({ gateways }: { gateways: GatewaysFile }) {
  const entries = Object.entries(gateways.gateways);
  if (entries.length === 0) {
    return (
      <Text dimColor>
        no gateways configured · <Text color="cyan">vibestrate gateways add</Text>
      </Text>
    );
  }
  return (
    <Box flexWrap="wrap">
      <Text>
        {entries.map(([name, cfg], i) => (
          <React.Fragment key={name}>
            {i > 0 ? <Text dimColor>   </Text> : null}
            <Text color={cfg.enabled ? "green" : "gray"}>
              {cfg.enabled ? "●" : "○"}
            </Text>
            <Text> {name}</Text>
          </React.Fragment>
        ))}
      </Text>
    </Box>
  );
}

function severityColor(s: string): "green" | "yellow" | "red" | "cyan" | undefined {
  if (s === "info") return "cyan";
  if (s === "warn") return "yellow";
  if (s === "error") return "red";
  return undefined;
}
function severityGlyph(s: string): string {
  if (s === "error") return "✗";
  if (s === "warn") return "!";
  if (s === "info") return "ℹ";
  return "●";
}

function KV({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: "yellow" | "red" | "green" | "cyan";
}) {
  return (
    <Box>
      <Text>
        <Text dimColor>{label.padEnd(10)}</Text>
        <Text color={tint}>{value}</Text>
      </Text>
    </Box>
  );
}
