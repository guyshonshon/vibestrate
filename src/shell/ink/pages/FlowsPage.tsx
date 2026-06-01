import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { DiscoveredFlow } from "../../../flows/catalog/flow-discovery.js";
import { createProjectFlow } from "../../../flows/runtime/flow-portability.js";
import {
  fetchHubIndex,
  installFlowFromHub,
  type HubFlowEntry,
} from "../../../flows/hub/flow-hub.js";
import { ACCENT, ACCENT_BRIGHT, ACCENT_DIM } from "../theme.js";
import { SelectionMark } from "../components/visuals.js";

type Props = {
  projectRoot: string;
  flows: DiscoveredFlow[];
  refresh: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  active: boolean;
};

type HubState =
  | { phase: "closed" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "list"; entries: HubFlowEntry[]; index: number };

export function FlowsPage({
  projectRoot,
  flows,
  refresh,
  onToast,
  selectedIndex,
  setSelectedIndex,
  active,
}: Props) {
  const idx = Math.max(0, Math.min(flows.length - 1, selectedIndex));
  const selected = flows[idx] ?? null;
  const [hub, setHub] = useState<HubState>({ phase: "closed" });

  const openHub = async (): Promise<void> => {
    setHub({ phase: "loading" });
    const r = await fetchHubIndex({});
    if (!r.ok) {
      setHub({ phase: "error", message: r.reason });
      return;
    }
    setHub({ phase: "list", entries: r.value.flows, index: 0 });
  };

  const fork = async (flow: DiscoveredFlow): Promise<void> => {
    const newId = `${flow.id}-copy`;
    const r = await createProjectFlow({
      projectRoot,
      definition: { ...flow.definition, id: newId },
    });
    if (r.ok) {
      onToast("ok", `Forked → project flow "${r.flowId}".`);
      await refresh();
    } else {
      onToast("err", r.reasons.join(" · "));
    }
  };

  const install = async (entry: HubFlowEntry): Promise<void> => {
    onToast("info", `Installing ${entry.name}…`);
    const r = await installFlowFromHub({ projectRoot, name: entry.name });
    if (r.ok) {
      onToast("ok", `Installed hub flow "${r.flowId}".`);
      setHub({ phase: "closed" });
      await refresh();
    } else {
      onToast("err", r.reasons.join(" · "));
    }
  };

  useInput(
    (input, key) => {
      if (!active) return;
      if (hub.phase !== "closed") {
        if (key.escape) {
          setHub({ phase: "closed" });
          return;
        }
        if (hub.phase === "list") {
          if (key.upArrow || input === "k") {
            setHub({ ...hub, index: Math.max(0, hub.index - 1) });
            return;
          }
          if (key.downArrow || input === "j") {
            setHub({ ...hub, index: Math.min(hub.entries.length - 1, hub.index + 1) });
            return;
          }
          if (key.return && hub.entries[hub.index]) {
            void install(hub.entries[hub.index]!);
            return;
          }
        }
        return;
      }
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex(Math.min(flows.length - 1, idx + 1));
        return;
      }
      if (input === "f" && selected) {
        if (selected.source.kind !== "builtin") {
          onToast("info", "Only built-in flows are forked; project flows are already yours to edit.");
          return;
        }
        void fork(selected);
        return;
      }
      if (input === "h") {
        void openHub();
        return;
      }
    },
    { isActive: active },
  );

  if (hub.phase !== "closed") return <HubView hub={hub} />;

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>
          {flows.length} flow{flows.length === 1 ? "" : "s"} · press{" "}
          <Text color={ACCENT}>h</Text> for the hub
        </Text>
      </Box>
      <Box flexDirection="row" marginTop={1}>
        {/* List */}
        <Box flexDirection="column" width="40%" marginRight={1}>
          {flows.map((f, i) => (
            <Text key={f.id} wrap="truncate-end">
              <SelectionMark selected={i === idx} />
              <Text color={i === idx ? ACCENT : undefined}>{f.label || f.id}</Text>
              <Text dimColor>
                {"  "}
                {f.source.kind === "builtin" ? "built-in" : "project"}
              </Text>
            </Text>
          ))}
        </Box>
        {/* Detail */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={ACCENT_DIM}
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          paddingLeft={1}
        >
          {selected ? <FlowDetail flow={selected} /> : <Text dimColor>No flow selected.</Text>}
        </Box>
      </Box>
    </Box>
  );
}

function FlowDetail({ flow }: { flow: DiscoveredFlow }) {
  const def = flow.definition as {
    steps?: Array<{ id?: string; kind?: string; seat?: string }>;
    seats?: Record<string, unknown>;
  };
  const steps = def.steps ?? [];
  const seats = Object.keys(def.seats ?? {});
  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_BRIGHT}>
        {flow.label || flow.id}
      </Text>
      <Text dimColor>
        {flow.id} · v{flow.version} · {flow.source.kind}
      </Text>
      {flow.description ? (
        <Box marginTop={1}>
          <Text wrap="wrap">{flow.description}</Text>
        </Box>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>seats: {seats.join(", ") || "—"}</Text>
        <Text dimColor>steps ({steps.length}):</Text>
        {steps.slice(0, 12).map((s, i) => (
          <Text key={s.id ?? i} wrap="truncate-end">
            {"  "}
            <Text color={ACCENT}>{s.kind ?? "step"}</Text>
            {s.seat ? <Text dimColor>{"  "}{s.seat}</Text> : null}
          </Text>
        ))}
        {steps.length > 12 ? (
          <Text dimColor>{"  "}+ {steps.length - 12} more</Text>
        ) : null}
      </Box>
    </Box>
  );
}

function HubView({ hub }: { hub: HubState }) {
  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_BRIGHT}>
        Flows hub
      </Text>
      {hub.phase === "loading" ? (
        <Text dimColor>fetching the hub index…</Text>
      ) : hub.phase === "error" ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">Hub unavailable: {hub.message}</Text>
          <Text dimColor>
            (No flows published yet, or offline.) Esc to go back.
          </Text>
        </Box>
      ) : hub.phase === "list" ? (
        <Box flexDirection="column" marginTop={1}>
          {hub.entries.length === 0 ? (
            <Text dimColor>The hub index is empty.</Text>
          ) : (
            hub.entries.map((e, i) => (
              <Text key={e.name} wrap="truncate-end">
                <SelectionMark selected={i === hub.index} />
                <Text color={i === hub.index ? ACCENT : undefined}>{e.label || e.name}</Text>
                <Text dimColor>
                  {"  "}v{e.latest}
                  {e.description ? `  ${e.description}` : ""}
                </Text>
              </Text>
            ))
          )}
          <Box marginTop={1}>
            <Text dimColor>
              <Text color={ACCENT}>↑↓</Text> select · <Text color={ACCENT}>↵</Text>{" "}
              install · <Text color={ACCENT}>Esc</Text> back
            </Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
