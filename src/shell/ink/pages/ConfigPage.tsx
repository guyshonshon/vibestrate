import React from "react";
import { Box, Text, useInput } from "ink";
import type { ProjectConfig } from "../../../project/config-schema.js";
import {
  buildConfigView,
  type ConfigRow,
  type ConfigSection,
} from "../../../setup/config-view.js";
import { ACCENT, ACCENT_BRIGHT } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";

type Props = {
  config: ProjectConfig | null;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

const TONE_COLOR: Record<NonNullable<ConfigRow["tone"]>, string | undefined> = {
  default: undefined,
  on: "green",
  off: "gray",
  warn: "yellow",
};

const LABEL_WIDTH = 24;

// Pad to a column, but keep at least two spaces so an over-long label never
// runs straight into its value.
function padLabel(label: string): string {
  return label.length < LABEL_WIDTH ? label.padEnd(LABEL_WIDTH) : `${label}  `;
}

function Row({ row }: { row: ConfigRow }) {
  return (
    <Text wrap="truncate-end">
      <Text dimColor>{padLabel(row.label)}</Text>
      <Text color={TONE_COLOR[row.tone ?? "default"]}>{row.value}</Text>
      {row.hint ? <Text dimColor>{`  (${row.hint})`}</Text> : null}
    </Text>
  );
}

export function ConfigPage({
  config,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const view = config ? buildConfigView(config) : null;
  const sections: ConfigSection[] = view?.sections ?? [];
  const idx = Math.max(0, Math.min(sections.length - 1, selectedIndex));
  const selected = sections[idx] ?? null;

  useInput(
    (input, key) => {
      if (!active) return;
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(sections.length - 1, idx + 1));
        return;
      }
    },
    { isActive: active },
  );

  if (!config || !view) return <Text dimColor>loading project config…</Text>;

  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_BRIGHT}>
        CONFIG{" "}
        <Text dimColor>
          {"  "}
          {view.project.name} ({view.project.type}) · .vibestrate/project.yml
        </Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box flexDirection="column" minWidth={20}>
          {sections.map((s, i) => (
            <Text key={s.id} wrap="truncate-end">
              <SelectionMark selected={i === idx} />
              <Text bold={i === idx} color={i === idx ? ACCENT : undefined}>
                {s.title}
              </Text>
            </Text>
          ))}
        </Box>
        {selected ? (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color={ACCENT}>
              {selected.title}
            </Text>
            <Text dimColor>{selected.summary}</Text>
            <Box marginTop={1} flexDirection="column">
              {selected.rows.map((row, i) => (
                <Row key={i} row={row} />
              ))}
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Text wrap="truncate-end">
                <Text dimColor>edit  </Text>
                <Text color={selected.editable.live ? "green" : "gray"}>
                  {selected.editable.live ? "live" : "static"}
                </Text>
                {selected.editable.surface ? (
                  <Text>{`  ${selected.editable.surface}`}</Text>
                ) : null}
              </Text>
              {selected.editable.cli.map((cli) => (
                <Text key={cli} color={ACCENT} wrap="truncate-end">
                  {`      ${cli}`}
                </Text>
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
