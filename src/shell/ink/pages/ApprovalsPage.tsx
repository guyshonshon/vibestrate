import React from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalRow } from "../hooks/useApprovals.js";
import { clip, timeAgo } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";
import { approveApproval, rejectApproval } from "../inbox/inbox-actions.js";

type Props = {
  projectRoot: string;
  items: ApprovalRow[];
  refresh: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

export function ApprovalsPage({
  projectRoot,
  items,
  refresh,
  onToast,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const idx = Math.max(0, Math.min(items.length - 1, selectedIndex));
  const selected = items[idx] ?? null;

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(items.length - 1, idx + 1));
        return;
      }
      if ((input === "a" || input === "A") && selected) {
        void approveApproval(projectRoot, selected.runId, selected.id).then(
          async (r) => {
            onToast(r.ok ? "ok" : "err", r.message);
            await refresh();
          },
        );
        return;
      }
      if ((input === "r" || input === "R") && selected) {
        void rejectApproval(projectRoot, selected.runId, selected.id).then(
          async (r) => {
            onToast(r.ok ? "ok" : "err", r.message);
            await refresh();
          },
        );
      }
    },
    { isActive: active },
  );

  if (items.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">
          APPROVALS
          <Text dimColor>   (0)</Text>
        </Text>
        <Box marginTop={1}>
          <Text dimColor>nothing waiting on you · runs continue uninterrupted</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        APPROVALS
        <Text dimColor>   ({items.length} pending)</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column" minWidth={40}>
          {items.slice(0, 12).map((a, i) => (
            <Box key={a.id}>
              <SelectionMark selected={i === idx} />
              <Text>
                <Text color={tintForRisk(a.riskLevel)}>⏳</Text>
                <Text bold={i === idx}>
                  {"  "}
                  {clip(a.agentId, 10).padEnd(10)}
                </Text>
                <Text dimColor>  {clip(a.runId, 24).padEnd(24)}</Text>
                <Text dimColor>  {timeAgo(a.createdAt).padStart(6)}</Text>
              </Text>
            </Box>
          ))}
          {items.length > 12 ? (
            <Text dimColor>+ {items.length - 12} more</Text>
          ) : null}
        </Box>
        {selected ? (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="cyan">
              {selected.agentId}
              <Text dimColor>   {selected.stageId}</Text>
            </Text>
            <Box marginTop={1} flexDirection="column">
              <KV label="run" value={selected.runId} />
              <KV
                label="risk"
                value={selected.riskLevel}
                tint={tintForRisk(selected.riskLevel)}
              />
              <KV label="source" value={selected.source} />
              {selected.requestedAction ? (
                <KV label="action" value={selected.requestedAction} />
              ) : null}
              {selected.reason ? (
                <KV label="reason" value={selected.reason} />
              ) : null}
            </Box>
            {selected.prompt ? (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>prompt excerpt</Text>
                {selected.prompt
                  .split("\n")
                  .slice(0, 8)
                  .map((line, i) => (
                    <Text key={i}>{clip(line, 80)}</Text>
                  ))}
              </Box>
            ) : null}
            <Box marginTop={1}>
              <Text dimColor>
                press <Text color="cyan">a</Text> approve ·{" "}
                <Text color="cyan">r</Text> reject
              </Text>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function tintForRisk(risk: string): "green" | "yellow" | "red" | undefined {
  if (risk === "low") return "green";
  if (risk === "medium") return "yellow";
  if (risk === "high") return "red";
  return undefined;
}

function KV({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: "yellow" | "red" | "green";
}) {
  return (
    <Box>
      <Text>
        <Text dimColor>{label.padEnd(8)}</Text>
        <Text color={tint}>{value}</Text>
      </Text>
    </Box>
  );
}
