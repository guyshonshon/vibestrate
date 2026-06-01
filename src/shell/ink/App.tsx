import React, { useEffect, useReducer } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Footer } from "./components/Footer.js";
import {
  CommandPalette,
  paletteMatches,
} from "./components/CommandPalette.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { PromptBar } from "./components/PromptBar.js";
import { ContextLine } from "./components/StatusBar.js";
import { HeaderBar } from "./components/HeaderBar.js";
import { Panel } from "./components/Panel.js";
import { OutputPane } from "./components/OutputPane.js";
import { ActionsPanel } from "./components/ActionsPanel.js";
import { DocsOverlay } from "./components/DocsOverlay.js";
import { CrewFlowPicker } from "./components/CrewFlowPicker.js";
import { listDocs, readDoc, DOCS_WEBSITE } from "./docs-source.js";
import { renderMarkdown } from "./markdown-render.js";
import {
  parseArgs,
  runVibestrateCommand,
  spawnVibestrateDetached,
  openInBrowser,
} from "./runner/command-runner.js";
import { discoverFlows } from "../../flows/catalog/flow-discovery.js";
import { buildStatusModel } from "./status-model.js";
import { applySessionDefaults } from "./session-defaults.js";
import { deriveRerunArgs, formatArgv } from "../../scheduler/rerun-args.js";
import { RunsPage } from "./pages/RunsPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { RoadmapPage } from "./pages/RoadmapPage.js";
import { QueuePage } from "./pages/QueuePage.js";
import { AgentsPage } from "./pages/AgentsPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
import { useConflicts } from "./hooks/useConflicts.js";
import { useProjectConfig } from "./hooks/useProjectConfig.js";
import { useSkills } from "./hooks/useSkills.js";
import { useApprovals } from "./hooks/useApprovals.js";
import { useSuggestions } from "./hooks/useSuggestions.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useDoctor } from "./hooks/useDoctor.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";
import { SuggestionsPage } from "./pages/SuggestionsPage.js";
import { NotificationsPage } from "./pages/NotificationsPage.js";
import { DoctorPage } from "./pages/DoctorPage.js";
import { PlaceholderPage } from "./pages/PlaceholderPage.js";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { Rule } from "./components/Frame.js";
import { ACCENT, ACCENT_DIM, ACCENT_DEEP } from "./theme.js";
import { useTasks } from "./hooks/useTasks.js";
import {
  initialUiState,
  pageIdFromHotkey,
  pageLabel,
  reduceShellUi,
  type PageId,
} from "./ui-state.js";
import { useSnapshot } from "./hooks/useSnapshot.js";
import { useGitContext } from "./hooks/useGitContext.js";
import { pauseRun, resumeRun, abortRun } from "../shell-actions.js";
import { pauseScheduler, resumeScheduler } from "./queue/queue-actions.js";
import type { PaletteCommand } from "./palette.js";

type Props = {
  projectRoot: string;
  refreshMs?: number;
  /** Dashboard URL when launched alongside the shell (`vibe shell --ui`).
   *  When null we fall through to VIBESTRATE_UI_URL env, then a localhost
   *  default — opening it just tries http://127.0.0.1:4317. */
  uiUrl?: string | null;
};

const FUTURE_PHASES: Partial<Record<PageId, string>> = {};

const DEFAULT_UI_URL = "http://127.0.0.1:4317";

function resolveUiUrl(propUrl: string | null | undefined): string {
  if (propUrl) return propUrl;
  const env = process.env.VIBESTRATE_UI_URL;
  if (env && env.length > 0) return env;
  return DEFAULT_UI_URL;
}

export function App({ projectRoot, refreshMs, uiUrl }: Props) {
  const [ui, dispatch] = useReducer(reduceShellUi, initialUiState);
  const { snapshot, refresh } = useSnapshot({ projectRoot, refreshMs });
  const { tasks, refresh: refreshTasks } = useTasks(projectRoot);
  const { warnings, refresh: refreshWarnings } = useConflicts(projectRoot);
  const { config, error: configError } = useProjectConfig(projectRoot);
  const {
    skills,
    assignments,
    refresh: refreshSkills,
  } = useSkills(projectRoot);
  const { items: approvalItems, refresh: refreshApprovals } = useApprovals(
    projectRoot,
    snapshot,
  );
  const { items: suggestionItems, refresh: refreshSuggestions } =
    useSuggestions(projectRoot, snapshot);
  const {
    items: notifItems,
    gateways: notifGateways,
  } = useNotifications(projectRoot);
  const {
    report: doctorReport,
    loading: doctorLoading,
    error: doctorError,
    refresh: refreshDoctor,
  } = useDoctor(projectRoot);
  const { git } = useGitContext(projectRoot);
  const { exit } = useApp();

  const runs = snapshot?.runs ?? [];
  const selectedRun =
    ui.page === "runs" ? runs[ui.selection.runs] ?? null : null;

  const projectName = projectRoot.split("/").filter(Boolean).slice(-1)[0] ?? "";
  const statusModel = buildStatusModel({
    projectName,
    git,
    session: ui.session,
    defaultCrewId: config?.defaultCrew ?? null,
    aggregates: snapshot?.aggregates ?? null,
    runs: runs.map((r) => ({
      status: r.status,
      task: r.task,
      updatedAt: r.updatedAt,
    })),
  });

  const openCrewPicker = (): void => {
    const ids = config ? Object.keys(config.crews) : [];
    if (ids.length === 0) {
      dispatch({ type: "toast.push", kind: "err", message: "No crews configured." });
      return;
    }
    const items = ids.map((id) => ({ id, label: config!.crews[id]?.label ?? id }));
    const cur = ui.session.crewId ?? config?.defaultCrew ?? null;
    const index = Math.max(0, items.findIndex((it) => it.id === cur));
    dispatch({ type: "picker.open", kind: "crew", items, index });
  };

  const openFlowPicker = async (): Promise<void> => {
    const flows = await discoverFlows(projectRoot);
    const items = flows.map((f) => ({ id: f.id, label: f.label || f.id }));
    if (items.length === 0) {
      dispatch({ type: "toast.push", kind: "err", message: "No flows available." });
      return;
    }
    const cur = ui.session.flowId ?? "default";
    const index = Math.max(0, items.findIndex((it) => it.id === cur));
    dispatch({ type: "picker.open", kind: "flow", items, index });
  };

  const submitPrompt = (): void => {
    const argv0 = parseArgs(ui.runner.input);
    if (argv0.length === 0) return;
    const argv = applySessionDefaults(argv0, ui.session);
    dispatch({ type: "runner.started" });
    void runVibestrateCommand({
      projectRoot,
      argv,
      onChunk: (chunk) => dispatch({ type: "runner.append", chunk }),
    }).then((r) => {
      dispatch({ type: "runner.finished", exitCode: r.exitCode });
      void refresh();
    });
  };

  // Toast auto-dismiss.
  useEffect(() => {
    if (ui.toasts.length === 0) return;
    const newest = ui.toasts[ui.toasts.length - 1]!;
    const t = setTimeout(() => {
      dispatch({ type: "toast.dismiss", id: newest.id });
    }, 3000);
    return () => clearTimeout(t);
  }, [ui.toasts]);

  // Docs: load the topic list when the browser opens, then select the first.
  useEffect(() => {
    if (!ui.docs.open || ui.docs.topics.length > 0) return;
    let cancelled = false;
    void listDocs()
      .then((topics) => {
        if (cancelled) return;
        dispatch({ type: "docs.loaded", topics });
        dispatch({ type: "docs.select", index: 0 });
      })
      .catch((err) => {
        if (cancelled) return;
        dispatch({
          type: "docs.error",
          message: `Docs aren't bundled here (${err instanceof Error ? err.message : String(err)}).`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [ui.docs.open, ui.docs.topics.length]);

  // Docs: render the selected topic's markdown whenever it changes.
  useEffect(() => {
    if (!ui.docs.open || !ui.docs.loadingContent) return;
    const topic = ui.docs.topics[ui.docs.index];
    if (!topic) return;
    let cancelled = false;
    void readDoc(topic.slug)
      .then((md) => {
        if (cancelled) return;
        dispatch({ type: "docs.content", lines: renderMarkdown(md) });
      })
      .catch((err) => {
        if (cancelled) return;
        dispatch({
          type: "docs.error",
          message: `Could not read ${topic.slug} (${err instanceof Error ? err.message : String(err)}).`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [ui.docs.open, ui.docs.loadingContent, ui.docs.index, ui.docs.topics]);

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
      case "pause-scheduler":
        void pauseScheduler(projectRoot).then(async (r) => {
          dispatch({
            type: "toast.push",
            kind: r.ok ? "ok" : "err",
            message: r.message,
          });
          await refresh();
        });
        return;
      case "resume-scheduler":
        void resumeScheduler(projectRoot).then(async (r) => {
          dispatch({
            type: "toast.push",
            kind: r.ok ? "ok" : "err",
            message: r.message,
          });
          await refresh();
        });
        return;
      case "open-runner":
        if (cmd.action.seed !== undefined) {
          dispatch({ type: "runner.input", value: cmd.action.seed });
        }
        dispatch({ type: "prompt.focus" });
        return;
      case "open-docs":
        dispatch({ type: "docs.open" });
        return;
      case "spawn-detached": {
        const { pid } = spawnVibestrateDetached({
          projectRoot,
          argv: cmd.action.argv,
        });
        dispatch({
          type: "toast.push",
          kind: "ok",
          message:
            cmd.action.toast ??
            `Started \`vibe ${cmd.action.argv.join(" ")}\` (pid ${pid ?? "—"}).`,
        });
        return;
      }
      case "open-url": {
        // If the palette entry hard-codes the default localhost URL,
        // upgrade it to the runtime-resolved one so users who picked
        // a different port via `vibe shell --ui --ui-port` aren't
        // routed to a dead tab.
        const target =
          cmd.action.url === DEFAULT_UI_URL
            ? resolveUiUrl(uiUrl)
            : cmd.action.url;
        openInBrowser(target);
        dispatch({
          type: "toast.push",
          kind: "info",
          message: `Opening ${target} in your browser…`,
        });
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
    if (ui.docs.open) {
      if (key.escape) {
        dispatch({ type: "docs.close" });
        return;
      }
      if (input === "o") {
        openInBrowser(DOCS_WEBSITE);
        dispatch({ type: "toast.push", kind: "info", message: `Opening ${DOCS_WEBSITE}…` });
        return;
      }
      // Arrows / j-k scroll the page a line at a time; Space / b page; the
      // bracket keys switch topic. (No PgUp/PgDn — not on every keyboard.)
      if (key.upArrow || input === "k") {
        dispatch({ type: "docs.scroll", delta: -1 });
        return;
      }
      if (key.downArrow || input === "j") {
        dispatch({ type: "docs.scroll", delta: 1 });
        return;
      }
      if (input === " " || (key.ctrl && input === "f") || key.pageDown) {
        dispatch({ type: "docs.scroll", delta: 10 });
        return;
      }
      if (input === "b" || (key.ctrl && input === "u") || key.pageUp) {
        dispatch({ type: "docs.scroll", delta: -10 });
        return;
      }
      if (input === "[") {
        dispatch({ type: "docs.select", index: ui.docs.index - 1 });
        return;
      }
      if (input === "]" || key.tab) {
        dispatch({ type: "docs.select", index: ui.docs.index + 1 });
        return;
      }
      return;
    }
    if (ui.picker) {
      // Crew/Flow selector owns input while open.
      if (key.escape) {
        dispatch({ type: "picker.close" });
        return;
      }
      if (key.upArrow || input === "k") {
        dispatch({ type: "picker.move", delta: -1 });
        return;
      }
      if (key.downArrow || input === "j") {
        dispatch({ type: "picker.move", delta: 1 });
        return;
      }
      if (key.return) {
        const sel = ui.picker.items[ui.picker.index];
        const kind = ui.picker.kind;
        dispatch({ type: "picker.close" });
        if (sel) {
          dispatch(
            kind === "crew"
              ? { type: "session.crew.set", crewId: sel.id }
              : { type: "session.flow.set", flowId: sel.id },
          );
          dispatch({
            type: "toast.push",
            kind: "ok",
            message: `${kind} → ${sel.id} (seeds the next run)`,
          });
        }
        return;
      }
      return;
    }
    if (ui.promptFocused) {
      // The bottom prompt owns input. Esc returns to navigation; ↑/↓ walk
      // command history; Tab / Shift+Tab scroll the output pane (the only keys
      // ink-text-input leaves alone while you're typing). Typing + Enter are
      // handled by ink-text-input.
      if (key.escape) {
        dispatch({ type: "prompt.blur" });
        return;
      }
      if (key.upArrow) {
        dispatch({ type: "runner.history.prev" });
        return;
      }
      if (key.downArrow) {
        dispatch({ type: "runner.history.next" });
        return;
      }
      if (key.tab && ui.runner.output.length > 0) {
        // Shift+Tab → older (scroll up), Tab → newer (toward the tail).
        dispatch({ type: "runner.scroll", delta: key.shift ? 5 : -5 });
        return;
      }
      return;
    }
    if (ui.paletteOpen) {
      if (key.escape) {
        dispatch({ type: "palette.close" });
        return;
      }
      const max = Math.max(0, paletteMatches(ui.paletteQuery).length - 1);
      if (key.upArrow) {
        dispatch({ type: "palette.cursor.move", delta: -1, max });
        return;
      }
      if (key.downArrow) {
        dispatch({ type: "palette.cursor.move", delta: 1, max });
        return;
      }
      return; // TextInput handles the rest (typing, Enter).
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
    // Esc with no modal open goes "back" to the previously-visited
    // page. No-op when the user is already at their first page so we
    // don't accidentally rewind them to a stale tab.
    if (key.escape) {
      dispatch({ type: "page.back" });
      return;
    }
    if (input === ":") {
      dispatch({ type: "palette.open" });
      return;
    }
    // Focus the persistent bottom prompt. `i` (vim-insert) is the primary
    // key; `!` is kept as a familiar alias for the old command runner.
    if (input === "i" || input === "!") {
      dispatch({ type: "prompt.focus" });
      return;
    }
    if (input === "?") {
      dispatch({ type: "help.toggle" });
      return;
    }
    // Session context controls: cycle safety mode, pick Crew / Flow. `c` and
    // `f` are gated off the pages that already bind them (Roadmap `c`,
    // Doctor `f`) so there's no double-handling.
    if (input === "m") {
      dispatch({ type: "session.mode.cycle" });
      return;
    }
    if (input === "c" && ui.page !== "roadmap") {
      openCrewPicker();
      return;
    }
    if (input === "f" && ui.page !== "doctor") {
      void openFlowPicker();
      return;
    }
    // Docs browser. `d` is gated off Roadmap (which uses it to delete a task).
    if (input === "d" && ui.page !== "roadmap") {
      dispatch({ type: "docs.open" });
      return;
    }
    // Scroll the command-output pane from navigation mode: Shift+Tab older,
    // Tab newer (Tab is free here except on Runs, which cycles the inspector).
    if (key.tab && ui.page !== "runs" && ui.runner.output.length > 0) {
      dispatch({ type: "runner.scroll", delta: key.shift ? 5 : -5 });
      return;
    }
    // Open the dashboard in the default browser. Uses the URL passed
    // by `vibe shell --ui`, VIBESTRATE_UI_URL env, or the localhost default.
    // Lowercase `b` is unbound today; uppercase `B` matches the
    // existing "R for re-run" convention for one-letter actions.
    if (input === "B" || input === "b") {
      const url = resolveUiUrl(uiUrl);
      openInBrowser(url);
      dispatch({
        type: "toast.push",
        kind: "ok",
        message: `Opening ${url} in your browser…`,
      });
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
      // Capital R re-runs the selected run as a fresh `vibe run`.
      // The original run state is preserved on disk so the user can
      // still inspect the failure; the new run gets its own runId.
      if (input === "R" && selectedRun) {
        const argv = deriveRerunArgs(selectedRun);
        const { pid } = spawnVibestrateDetached({ projectRoot, argv });
        dispatch({
          type: "toast.push",
          kind: "ok",
          message: `Re-running ${selectedRun.runId} → spawned vibestrate ${formatArgv(argv)} (pid ${pid ?? "—"}).`,
        });
        return;
      }
    }
  });

  return (
    <Box flexDirection="column">
      {/* Region 1 — header: brand + context + menu (minimal hint). */}
      <Panel borderColor={ACCENT}>
        <HeaderBar model={statusModel} page={ui.page} />
      </Panel>
      {/* Region 2 — body: the active page (left) + command output (right). */}
      <Panel borderColor={ACCENT_DIM} flexGrow={1}>
       <Box flexDirection="row">
        <Box flexGrow={1} flexDirection="column">
        {snapshot ? (
          ui.page === "roadmap" ? (
            <RoadmapPage
              projectRoot={projectRoot}
              tasks={tasks}
              schedulerLiveness={snapshot.schedulerLiveness}
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
          ) : ui.page === "crew" ? (
            <AgentsPage
              config={config}
              configError={configError}
              selectedIndex={ui.selection.crew ?? 0}
              setSelectedIndex={(i) =>
                dispatch({ type: "selection.set", page: "crew", index: i })
              }
              active
            />
          ) : ui.page === "skills" ? (
            <SkillsPage
              projectRoot={projectRoot}
              skills={skills}
              assignments={assignments}
              refresh={refreshSkills}
              onToast={(kind, message) =>
                dispatch({ type: "toast.push", kind, message })
              }
              selectedIndex={ui.selection.skills ?? 0}
              setSelectedIndex={(i) =>
                dispatch({ type: "selection.set", page: "skills", index: i })
              }
              active
            />
          ) : ui.page === "approvals" ? (
            <ApprovalsPage
              projectRoot={projectRoot}
              items={approvalItems}
              refresh={async () => {
                await refreshApprovals();
                await refresh();
              }}
              onToast={(kind, message) =>
                dispatch({ type: "toast.push", kind, message })
              }
              selectedIndex={ui.selection.approvals ?? 0}
              setSelectedIndex={(i) =>
                dispatch({ type: "selection.set", page: "approvals", index: i })
              }
              active
            />
          ) : ui.page === "suggestions" ? (
            <SuggestionsPage
              projectRoot={projectRoot}
              items={suggestionItems}
              refresh={async () => {
                await refreshSuggestions();
                await refresh();
              }}
              onToast={(kind, message) =>
                dispatch({ type: "toast.push", kind, message })
              }
              selectedIndex={ui.selection.suggestions ?? 0}
              setSelectedIndex={(i) =>
                dispatch({
                  type: "selection.set",
                  page: "suggestions",
                  index: i,
                })
              }
              active
            />
          ) : ui.page === "notifications" ? (
            <NotificationsPage
              items={notifItems}
              gateways={notifGateways}
              selectedIndex={ui.selection.notifications ?? 0}
              setSelectedIndex={(i) =>
                dispatch({
                  type: "selection.set",
                  page: "notifications",
                  index: i,
                })
              }
              active
            />
          ) : ui.page === "doctor" ? (
            <DoctorPage
              projectRoot={projectRoot}
              report={doctorReport}
              loading={doctorLoading}
              error={doctorError}
              refresh={refreshDoctor}
              onToast={(kind, message) =>
                dispatch({ type: "toast.push", kind, message })
              }
              active
            />
          ) : ui.page === "queue" ? (
            <QueuePage
              projectRoot={projectRoot}
              snapshot={snapshot}
              warnings={warnings}
              refreshSnapshot={refresh}
              refreshWarnings={refreshWarnings}
              onToast={(kind, message) =>
                dispatch({ type: "toast.push", kind, message })
              }
              selectedIndex={ui.selection.queue ?? 0}
              setSelectedIndex={(i) =>
                dispatch({ type: "selection.set", page: "queue", index: i })
              }
              active
            />
          ) : (
            renderPage(ui.page, snapshot, ui, dispatch)
          )
        ) : (
          <LoadingScreen projectRoot={projectRoot} />
        )}
        </Box>
        {ui.runner.output.length > 0 ? (
          <OutputPane
            output={ui.runner.output}
            running={ui.runner.running}
            exitCode={ui.runner.exitCode}
            scroll={ui.runner.scroll}
          />
        ) : (
          <ActionsPanel page={ui.page} />
        )}
       </Box>
      </Panel>
      {/* Region 3 — context line + prompt + key hints. Border brightens
          to cyan while the prompt owns input. */}
      <Panel borderColor={ui.promptFocused ? ACCENT_DEEP : ACCENT_DIM}>
        <ContextLine model={statusModel} />
        <Rule />
        <PromptBar
          input={ui.runner.input}
          running={ui.runner.running}
          exitCode={ui.runner.exitCode}
          focused={ui.promptFocused}
          hasOutput={ui.runner.output.length > 0}
          onChange={(v) => dispatch({ type: "runner.input", value: v })}
          onSubmit={submitPrompt}
        />
        <Footer ui={ui} capturedAt={snapshot?.capturedAt ?? null} />
      </Panel>
      {ui.picker ? (
        <Box marginTop={1}>
          <CrewFlowPicker
            kind={ui.picker.kind}
            items={ui.picker.items}
            index={ui.picker.index}
          />
        </Box>
      ) : null}
      {ui.paletteOpen ? (
        <Box marginTop={1}>
          <CommandPalette
            query={ui.paletteQuery}
            selectedIndex={ui.paletteSelectedIndex}
            onChange={(v) => dispatch({ type: "palette.query", value: v })}
            onSubmit={handlePaletteSubmit}
            onCancel={() => dispatch({ type: "palette.close" })}
          />
        </Box>
      ) : null}
      {ui.helpOpen ? (
        <Box marginTop={1}>
          <HelpOverlay currentPage={ui.page} />
        </Box>
      ) : null}
      {ui.docs.open ? (
        <Box marginTop={1}>
          <DocsOverlay docs={ui.docs} />
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
