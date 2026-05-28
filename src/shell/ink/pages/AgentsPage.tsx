import React from "react";
import { Box, Text, useInput } from "ink";
import type { ProjectConfig } from "../../../project/config-schema.js";
import { clip } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";

type Props = {
  config: ProjectConfig | null;
  configError: string | null;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

export function AgentsPage({
  config,
  configError,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const agents = config
    ? Object.entries(config.roles).map(([id, a]) => ({ id, ...a }))
    : [];
  const idx = Math.max(0, Math.min(agents.length - 1, selectedIndex));
  const selected = agents[idx] ?? null;

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(agents.length - 1, idx + 1));
        return;
      }
    },
    { isActive: active },
  );

  if (configError) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">project.yml not loadable</Text>
        <Text dimColor>{configError}</Text>
        <Box marginTop={1}>
          <Text dimColor>
            run <Text color="cyan">vibestrate init</Text> to scaffold the project
          </Text>
        </Box>
      </Box>
    );
  }
  if (!config) {
    return <Text dimColor>loading project config…</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        AGENTS
        <Text dimColor>   ({agents.length})</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column" minWidth={28}>
          {agents.map((a, i) => (
            <Box key={a.id}>
              <SelectionMark selected={i === idx} />
              <Text>
                <Text bold={i === idx}>{a.id.padEnd(10)}</Text>
                <Text dimColor>  {clip(a.provider, 14)}</Text>
              </Text>
            </Box>
          ))}
        </Box>
        {selected ? (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="cyan">
              {selected.id}
            </Text>
            <Box marginTop={1} flexDirection="column">
              <KV label="provider" value={selected.provider} />
              <KV label="prompt" value={selected.prompt} mono />
              <KV label="permissions" value={selected.permissions} />
              <KV
                label="skills"
                value={
                  selected.skills.length > 0
                    ? selected.skills.join(", ")
                    : "(none)"
                }
              />
              <KV
                label="mcp servers"
                value={
                  Object.keys(selected.mcpServers ?? {}).length > 0
                    ? Object.keys(selected.mcpServers!).join(", ")
                    : "(none)"
                }
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                edit via project.yml ·{" "}
                <Text color="cyan">vibestrate config show</Text>
              </Text>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

const LABEL_WIDTH = 12;

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Box>
      <Text>
        <Text dimColor>{label.padEnd(LABEL_WIDTH)}</Text>
        <Text>{value}</Text>
      </Text>
    </Box>
  );
  void mono;
}
