import React from "react";
import { Box, Text, useInput } from "ink";
import type { SuggestionRow } from "../hooks/useSuggestions.js";
import { clip, timeAgo } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";
import { approveSuggestion, rejectSuggestion } from "../inbox/inbox-actions.js";

type Props = {
  projectRoot: string;
  items: SuggestionRow[];
  refresh: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

export function SuggestionsPage({
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
        void approveSuggestion(projectRoot, selected.runId, selected.id).then(
          async (r) => {
            onToast(r.ok ? "ok" : "err", r.message);
            await refresh();
          },
        );
        return;
      }
      if ((input === "r" || input === "R") && selected) {
        void rejectSuggestion(projectRoot, selected.runId, selected.id).then(
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
          SUGGESTIONS
          <Text dimColor>   (0)</Text>
        </Text>
        <Box marginTop={1}>
          <Text dimColor>no open suggestions across active runs</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        SUGGESTIONS
        <Text dimColor>   ({items.length} open)</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column" minWidth={40}>
          {items.slice(0, 12).map((s, i) => (
            <Box key={s.id}>
              <SelectionMark selected={i === idx} />
              <Text>
                <Text color="yellow">✎</Text>
                <Text bold={i === idx}>
                  {"  "}
                  {clip(s.title, 32).padEnd(32)}
                </Text>
                <Text dimColor>  {clip(s.runId, 20).padEnd(20)}</Text>
                <Text dimColor>  {timeAgo(s.createdAt).padStart(6)}</Text>
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
              {selected.title}
            </Text>
            <Box marginTop={1} flexDirection="column">
              <KV label="run" value={selected.runId} />
              <KV label="source" value={selected.source} />
              {selected.file ? (
                <KV
                  label="file"
                  value={
                    selected.file +
                    (selected.lineStart
                      ? `:${selected.lineStart}${selected.lineEnd ? `-${selected.lineEnd}` : ""}`
                      : "")
                  }
                />
              ) : null}
              {selected.validationProfile ? (
                <KV label="profile" value={selected.validationProfile} />
              ) : null}
            </Box>
            {selected.body ? (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>summary</Text>
                {selected.body
                  .split("\n")
                  .slice(0, 8)
                  .map((line, i) => (
                    <Text key={i}>{clip(line, 80)}</Text>
                  ))}
              </Box>
            ) : null}
            {selected.proposedPatch ? (
              <Box marginTop={1}>
                <Text dimColor>
                  patch attached · run{" "}
                  <Text color="cyan">
                    amaco suggestions show {selected.id}
                  </Text>{" "}
                  to inspect
                </Text>
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

function KV({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box>
      <Text>
        <Text dimColor>{label.padEnd(8)}</Text>
        <Text>{value}</Text>
      </Text>
    </Box>
  );
}
