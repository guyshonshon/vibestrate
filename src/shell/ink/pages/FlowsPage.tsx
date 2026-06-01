import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { DiscoveredFlow } from "../../../flows/catalog/flow-discovery.js";
import { createProjectFlow } from "../../../flows/runtime/flow-portability.js";
import {
  searchHubFlows,
  installFlowFromHub,
  type HubFlowSummary,
} from "../../../flows/hub/hub-client.js";
import {
  isGraphSteps,
  layersOf,
  zonedLayersOf,
} from "../../../flows/runtime/flow-graph-layout.js";
import type { ShellUiAction } from "../ui-state.js";
import { ACCENT, ACCENT_BRIGHT, ACCENT_DIM } from "../theme.js";

type FlowDefStep = DiscoveredFlow["definition"]["steps"][number];
import { SelectionMark } from "../components/visuals.js";

type HubUi = { hubOpen: boolean; hubFilterOpen: boolean; hubQuery: string };

type Props = {
  projectRoot: string;
  flows: DiscoveredFlow[];
  refresh: () => Promise<void>;
  onToast: (kind: "ok" | "err" | "info", message: string) => void;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  hubUi: HubUi;
  dispatch: (action: ShellUiAction) => void;
  sessionFlowId: string | null;
  active: boolean;
};

/** Best-effort one-line summary of the server-provided `diagnosis` blob. */
function diagnosisLabel(d: unknown): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    for (const k of ["verdict", "status", "summary", "note"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return null;
}

export function FlowsPage({
  projectRoot,
  flows,
  refresh,
  onToast,
  selectedIndex,
  setSelectedIndex,
  hubUi,
  dispatch,
  sessionFlowId,
  active,
}: Props) {
  const idx = Math.max(0, Math.min(flows.length - 1, selectedIndex));
  const selected = flows[idx] ?? null;

  const [hubEntries, setHubEntries] = useState<HubFlowSummary[]>([]);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [hubIndex, setHubIndex] = useState(0);

  const runHubSearch = useCallback(async (query: string): Promise<void> => {
    setHubLoading(true);
    setHubError(null);
    // The shell is a local, user-initiated context (like the CLI), so a
    // custom/loopback hub base URL is allowed.
    const r = await searchHubFlows({ q: query, allowPrivateHosts: true });
    setHubLoading(false);
    if (!r.ok) {
      setHubError(r.reason);
      setHubEntries([]);
      return;
    }
    setHubEntries(r.value);
    setHubIndex(0);
  }, []);

  // Search when the hub view opens (uses whatever query is set). Explicit
  // searches call runHubSearch directly on submit.
  useEffect(() => {
    if (hubUi.hubOpen) void runHubSearch(hubUi.hubQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUi.hubOpen]);

  const fork = async (flow: DiscoveredFlow): Promise<void> => {
    const newId = `${flow.id}-copy`;
    const r = await createProjectFlow({
      projectRoot,
      definition: { ...flow.definition, id: newId },
    });
    if (r.ok) {
      onToast("ok", `Forked -> project flow "${r.flowId}".`);
      await refresh();
    } else {
      onToast("err", r.reasons.join(" - "));
    }
  };

  const install = async (entry: HubFlowSummary): Promise<void> => {
    onToast("info", `Installing ${entry.ref}...`);
    const r = await installFlowFromHub({
      projectRoot,
      ref: entry.ref,
      allowPrivateHosts: true,
    });
    if (r.ok) {
      onToast("ok", `Installed hub flow "${r.flowId}".`);
      dispatch({ type: "flows.hub.close" });
      await refresh();
    } else {
      onToast("err", r.reasons.join(" - "));
    }
  };

  useInput(
    (input, key) => {
      if (!active) return;

      if (hubUi.hubOpen) {
        // While the search box is focused, ink-text-input owns input (App
        // closes it on Esc); don't double-handle here.
        if (hubUi.hubFilterOpen) return;
        if (key.escape) {
          dispatch({ type: "flows.hub.close" });
          return;
        }
        if (input === "/") {
          dispatch({ type: "flows.hubFilter.open" });
          return;
        }
        if (key.upArrow || input === "k") {
          setHubIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setHubIndex((i) => Math.min(hubEntries.length - 1, i + 1));
          return;
        }
        if (key.return && hubEntries[hubIndex]) {
          void install(hubEntries[hubIndex]!);
          return;
        }
        return;
      }

      // Main flow list.
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
          onToast(
            "info",
            "Only built-in flows are forked; project flows are already yours to edit.",
          );
          return;
        }
        void fork(selected);
        return;
      }
      if (input === "h") {
        dispatch({ type: "flows.hub.open" });
        return;
      }
    },
    { isActive: active },
  );

  if (hubUi.hubOpen) {
    return (
      <HubView
        entries={hubEntries}
        index={Math.max(0, Math.min(hubEntries.length - 1, hubIndex))}
        loading={hubLoading}
        error={hubError}
        query={hubUi.hubQuery}
        filtering={hubUi.hubFilterOpen}
        onQueryChange={(v) => dispatch({ type: "flows.hubQuery.set", value: v })}
        onQuerySubmit={() => {
          dispatch({ type: "flows.hubFilter.close" });
          void runHubSearch(hubUi.hubQuery);
        }}
      />
    );
  }

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
                {f.id === sessionFlowId ? " · active" : ""}
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
  const def = flow.definition;
  const steps = def.steps;
  const seats = Object.keys(def.seats);
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
        <Text dimColor>seats: {seats.join(", ") || "-"}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {isGraphSteps(steps) ? (
          <FlowGraphView steps={steps} checklistSegment={def.checklistSegment ?? null} />
        ) : (
          <FlowStepsList steps={steps} />
        )}
      </Box>
    </Box>
  );
}

/** One step line: accent label + dim `kind · seat`, with a connector prefix. */
function GraphNode({ step, prefix }: { step: FlowDefStep; prefix: string }) {
  return (
    <Text wrap="truncate-end">
      <Text color={ACCENT_DIM}>{prefix}</Text>
      <Text color={ACCENT}>{step.label || step.id}</Text>
      <Text dimColor>
        {"  "}
        {step.kind}
        {step.seat ? ` · ${step.seat}` : ""}
      </Text>
    </Text>
  );
}

/**
 * Top-down layered render of a graph flow - mirrors the web FlowGraph and the
 * `vibe flows show` CLI. Each layer is a row; a layer with more than one step
 * is a parallel fan-out (read-only), boxed and labeled so its shape and the
 * join below it read at a glance.
 */
function GraphLayers({ layers }: { layers: FlowDefStep[][] }) {
  return (
    <>
      {layers.map((layer, li) => (
        <Box key={li} flexDirection="column">
          {li > 0 ? <Text color={ACCENT_DIM}>{"  │"}</Text> : null}
          {layer.length > 1 ? (
            <>
              <Text color={ACCENT_DIM}>
                {"  ┌ "}
                <Text dimColor>parallel ×{layer.length}</Text>
              </Text>
              {layer.map((s) => (
                <GraphNode key={s.id} step={s} prefix="  │ " />
              ))}
              <Text color={ACCENT_DIM}>{"  └─"}</Text>
            </>
          ) : (
            layer.map((s) => <GraphNode key={s.id} step={s} prefix="  " />)
          )}
        </Box>
      ))}
    </>
  );
}

function FlowGraphView({
  steps,
  checklistSegment = null,
}: {
  steps: FlowDefStep[];
  // Phase D: when set, zone the graph into prelude / per-item band / postlude so
  // the band boundary + its per-item repeat are visible (mirrors the web).
  checklistSegment?: { from: string; to: string } | null;
}) {
  return (
    <Box flexDirection="column">
      <Text dimColor>
        graph · {steps.length} step{steps.length === 1 ? "" : "s"}
      </Text>
      {checklistSegment ? (
        zonedLayersOf(steps, checklistSegment).map((zone, zi) => (
          <Box key={zi} flexDirection="column">
            {zi > 0 ? <Text color={ACCENT_DIM}>{"  │"}</Text> : null}
            {zone.repeats ? (
              <Text color={ACCENT}>{"  ── per checklist item (repeats) ──"}</Text>
            ) : null}
            <GraphLayers layers={zone.layers} />
          </Box>
        ))
      ) : (
        <GraphLayers layers={layersOf(steps)} />
      )}
    </Box>
  );
}

/** Plain numbered list for a linear flow (no `needs`). */
function FlowStepsList({ steps }: { steps: FlowDefStep[] }) {
  const shown = steps.slice(0, 12);
  return (
    <Box flexDirection="column">
      <Text dimColor>
        steps · {steps.length}
      </Text>
      {shown.map((s, i) => (
        <Text key={s.id ?? i} wrap="truncate-end">
          <Text color={ACCENT_DIM}>
            {"  "}
            {i + 1}.{" "}
          </Text>
          <Text color={ACCENT}>{s.label || s.id}</Text>
          <Text dimColor>
            {"  "}
            {s.kind}
            {s.seat ? ` · ${s.seat}` : ""}
          </Text>
        </Text>
      ))}
      {steps.length > shown.length ? (
        <Text dimColor>
          {"  "}+ {steps.length - shown.length} more
        </Text>
      ) : null}
    </Box>
  );
}

function HubView({
  entries,
  index,
  loading,
  error,
  query,
  filtering,
  onQueryChange,
  onQuerySubmit,
}: {
  entries: HubFlowSummary[];
  index: number;
  loading: boolean;
  error: string | null;
  query: string;
  filtering: boolean;
  onQueryChange: (v: string) => void;
  onQuerySubmit: () => void;
}) {
  return (
    <Box flexDirection="column">
      <Text bold color={ACCENT_BRIGHT}>
        Flows hub
      </Text>
      <Box>
        <Text color={filtering ? ACCENT : undefined}>search </Text>
        <TextInput
          value={query}
          focus={filtering}
          placeholder={filtering ? "" : "press / to search"}
          onChange={onQueryChange}
          onSubmit={onQuerySubmit}
        />
      </Box>
      {loading ? (
        <Text dimColor>fetching the hub...</Text>
      ) : error ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">Hub unavailable: {error}</Text>
          <Text dimColor>(Not published yet, or offline.) Esc to go back.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {entries.length === 0 ? (
            <Text dimColor>No flows match.</Text>
          ) : (
            entries.map((e, i) => {
              const diag = diagnosisLabel(e.diagnosis);
              return (
                <Text key={e.ref} wrap="truncate-end">
                  <SelectionMark selected={i === index} />
                  <Text color={i === index ? ACCENT : undefined}>
                    {e.label || e.name || e.ref}
                  </Text>
                  {e.verified ? <Text color="green">{"  "}verified</Text> : null}
                  <Text dimColor>
                    {e.version ? `  v${e.version}` : ""}
                    {diag ? `  ${diag}` : ""}
                  </Text>
                </Text>
              );
            })
          )}
          <Box marginTop={1}>
            <Text dimColor>
              <Text color={ACCENT}>/</Text> search · <Text color={ACCENT}>↑↓</Text>{" "}
              select · <Text color={ACCENT}>↵</Text> install ·{" "}
              <Text color={ACCENT}>Esc</Text> back
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
