import React, { useEffect, useReducer } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { TabBar } from "./components/TabBar.js";
import { Footer, COMMON_HINTS } from "./components/Footer.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { RunsPage } from "./pages/RunsPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { RoadmapPage } from "./pages/RoadmapPage.js";
import { PlaceholderPage } from "./pages/PlaceholderPage.js";
import { useTasks } from "./hooks/useTasks.js";
import {
  initialUiState,
  pageIdFromHotkey,
  pageLabel,
  reduceShellUi,
  type PageId,
} from "./ui-state.js";
import { useSnapshot } from "./hooks/useSnapshot.js";
import { pauseRun, resumeRun, abortRun } from "../shell-actions.js";
import type { PaletteCommand } from "./palette.js";

type Props = {
  projectRoot: string;
  refreshMs?: number;
};

const FUTURE_PHASES: Partial<Record<PageId, string>> = {
  queue: "Phase 4",
  agents: "Phase 5",
  skills: "Phase 5",
  approvals: "Phase 6",
  suggestions: "Phase 6",
  notifications: "Phase 7",
  doctor: "Phase 7",
};

export function App({ projectRoot, refreshMs }: Props) {
  const [ui, dispatch] = useReducer(reduceShellUi, initialUiState);
  const { snapshot, refresh } = useSnapshot({ projectRoot, refreshMs });
  const { tasks, refresh: refreshTasks } = useTasks(projectRoot);
  const { exit } = useApp();

  const runs = snapshot?.runs ?? [];
  const selectedRun =
    ui.page === "runs" ? runs[ui.selection.runs] ?? null : null;

  // Toast auto-dismiss.
  useEffect(() => {
    if (ui.toasts.length === 0) return;
    const newest = ui.toasts[ui.toasts.length - 1]!;
    const t = setTimeout(() => {
      dispatch({ type: "toast.dismiss", id: newest.id });
    }, 3000);
    return () => clearTimeout(t);
  }, [ui.toasts]);

  const runAction = async (
    name: "pause" | "resume" | "abort",
    runId: string,
  ): Promise<void> => {
    const fn =
      name === "pause" ? pauseRun : name === "resume" ? resumeRun : abortRun;
    const r = await fn(projectRoot, runId);
    dispatch({
      type: "toast.push",
      kind: r.ok ? "ok" : "err",
      message: r.message,
    });
    await refresh();
  };

  const handlePaletteSubmit = (cmd: PaletteCommand | null): void => {
    dispatch({ type: "palette.close" });
    if (!cmd) return;
    switch (cmd.action.kind) {
      case "goto":
        dispatch({ type: "page.set", page: cmd.action.page });
        return;
      case "open-help":
        dispatch({ type: "help.toggle" });
        return;
      case "quit":
        exit();
        return;
      case "pause-run":
      case "resume-run":
      case "abort-run": {
        if (!selectedRun) {
          dispatch({
            type: "toast.push",
            kind: "err",
            message: "No run selected.",
          });
          return;
        }
        if (cmd.action.kind === "abort-run") {
          dispatch({
            type: "confirm.set",
            value: { action: "abort", runId: selectedRun.runId },
          });
          return;
        }
        void runAction(
          cmd.action.kind === "pause-run" ? "pause" : "resume",
          selectedRun.runId,
        );
        return;
      }
    }
  };

  useInput((input, key) => {
    // Modal layers consume input before the page does.
    if (ui.helpOpen) {
      if (input === "?" || key.escape) dispatch({ type: "help.toggle" });
      return;
    }
    if (ui.paletteOpen) {
      if (key.escape) dispatch({ type: "palette.close" });
      return; // TextInput handles the typing.
    }
    if (ui.page === "runs" && ui.runs.eventFilterOpen) {
      // While the event filter TextInput is focused, only Esc closes
      // it; everything else flows through ink-text-input.
      if (key.escape) dispatch({ type: "runs.filter.close" });
      return;
    }
    if (
      ui.page === "roadmap" &&
      (ui.roadmap.formOpen || ui.roadmap.pendingDeleteTaskId)
    ) {
      // Roadmap form / delete-confirm own all input; bail so we don't
      // accidentally exit on a user typing 'q' into the title field
      // or interpret 'y' as a tab switch.
      return;
    }
    if (ui.pendingConfirm?.action === "abort") {
      const runId = ui.pendingConfirm.runId;
      dispatch({ type: "confirm.set", value: null });
      if (input === "y" || input === "Y") {
        void runAction("abort", runId);
      } else {
        dispatch({
          type: "toast.push",
          kind: "info",
          message: "abort cancelled.",
        });
      }
      return;
    }

    // Quit is lowercase-q only. Uppercase-Q is freed up so pages can
    // bind it (the Roadmap page uses it for "queue selected task").
    if (input === "q") {
      exit();
      return;
    }
    if (input === ":") {
      dispatch({ type: "palette.open" });
      return;
    }
    if (input === "?") {
      dispatch({ type: "help.toggle" });
      return;
    }
    // Number keys 0-9 → switch tab. We special-case "0" → tenth tab.
    const tabId = pageIdFromHotkey(input);
    if (tabId) {
      dispatch({ type: "page.set", page: tabId });
      return;
    }

    // Per-page list navigation + run controls. For now only the Runs
    // page consumes them; future phases will add per-page handlers.
    if (ui.page === "runs") {
      const max = Math.max(0, runs.length - 1);
      if (key.upArrow || input === "k") {
        dispatch({ type: "selection.move", page: "runs", delta: -1, max });
        return;
      }
      if (key.downArrow || input === "j") {
        dispatch({ type: "selection.move", page: "runs", delta: 1, max });
        return;
      }
      if (key.tab) {
        dispatch({ type: "runs.inspector.cycle", direction: 1 });
        return;
      }
      if (input === "o") {
        dispatch({ type: "runs.inspector.set", tab: "overview" });
        return;
      }
      if (input === "e") {
        dispatch({ type: "runs.inspector.set", tab: "events" });
        return;
      }
      if (input === "v") {
        dispatch({ type: "runs.inspector.set", tab: "validation" });
        return;
      }
      if (input === "/") {
        dispatch({ type: "runs.filter.open" });
        return;
      }
      if (input === "p" && selectedRun) {
        void runAction("pause", selectedRun.runId);
        return;
      }
      if (input === "r" && selectedRun) {
        void runAction("resume", selectedRun.runId);
        return;
      }
      if (input === "a" && selectedRun) {
        dispatch({
          type: "confirm.set",
          value: { action: "abort", runId: selectedRun.runId },
        });
        return;
      }
    }
  });

  const hints =
    ui.page === "runs"
      ? [
          { key: "↑/↓", label: "select" },
          { key: "tab", label: "section" },
          { key: "/", label: "filter" },
          { key: "p", label: "pause" },
          { key: "r", label: "resume" },
          { key: "a", label: "abort" },
          ...COMMON_HINTS,
        ]
      : ui.page === "roadmap"
        ? [
            { key: "←↑↓→", label: "navigate" },
            { key: "n", label: "new" },
            { key: "e", label: "edit" },
            { key: "d", label: "delete" },
            { key: "Q", label: "queue" },
            { key: "c", label: "→ready" },
            { key: ":", label: "palette" },
            { key: "q", label: "quit" },
          ]
        : ui.page === "dashboard"
          ? [
              { key: "2", label: "runs" },
              { key: ":", label: "palette" },
              { key: "?", label: "help" },
              { key: "q", label: "quit" },
            ]
          : COMMON_HINTS;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <TabBar current={ui.page} />
      <Box marginTop={1} flexDirection="column">
        {snapshot ? (
          ui.page === "roadmap" ? (
            <RoadmapPage
              projectRoot={projectRoot}
              tasks={tasks}
              refresh={refreshTasks}
              onToast={(kind, message) =>
                dispatch({ type: "toast.push", kind, message })
              }
              ui={ui.roadmap}
              setCursor={(c) =>
                dispatch({ type: "roadmap.cursor.set", cursor: c })
              }
              openForm={() => dispatch({ type: "roadmap.form.open" })}
              closeForm={() => dispatch({ type: "roadmap.form.close" })}
              setPendingDelete={(id) =>
                dispatch({ type: "roadmap.confirm.delete", taskId: id })
              }
              active
            />
          ) : (
            renderPage(ui.page, snapshot, ui, dispatch)
          )
        ) : (
          <Box paddingY={1}>
            <Text dimColor>loading project state…</Text>
          </Box>
        )}
      </Box>
      <Box marginTop={1}>
        <Footer
          ui={ui}
          hints={hints}
          capturedAt={snapshot?.capturedAt ?? null}
        />
      </Box>
      {ui.paletteOpen ? (
        <Box marginTop={1}>
          <CommandPalette
            query={ui.paletteQuery}
            onChange={(v) => dispatch({ type: "palette.query", value: v })}
            onSubmit={handlePaletteSubmit}
            onCancel={() => dispatch({ type: "palette.close" })}
          />
        </Box>
      ) : null}
      {ui.helpOpen ? (
        <Box marginTop={1}>
          <HelpOverlay />
        </Box>
      ) : null}
    </Box>
  );
}

function renderPage(
  page: PageId,
  snapshot: import("../shell-snapshot.js").ShellSnapshot,
  ui: import("./ui-state.js").ShellUiStateV2,
  dispatch: React.Dispatch<import("./ui-state.js").ShellUiAction>,
) {
  if (page === "dashboard") {
    return <DashboardPage snapshot={snapshot} />;
  }
  if (page === "runs") {
    return (
      <RunsPage
        snapshot={snapshot}
        ui={ui}
        onFilterChange={(v) => dispatch({ type: "runs.filter.set", value: v })}
        onFilterSubmit={() => dispatch({ type: "runs.filter.close" })}
      />
    );
  }
  const phase = FUTURE_PHASES[page] ?? "a later phase";
  return <PlaceholderPage title={pageLabel(page)} upcomingPhase={phase} />;
}
