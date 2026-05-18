import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell.js";
import { CliHintOverlay } from "../components/layout/CliHintOverlay.js";
import { RunsPage } from "./routes/RunsPage.js";
import { MissionControlPage } from "./routes/MissionControlPage.js";
import { RunDetailPage } from "./routes/RunDetailPage.js";
import { BoardPage } from "./routes/BoardPage.js";
import { TaskDetailPage } from "./routes/TaskDetailPage.js";
import { QueuePage } from "./routes/QueuePage.js";
import { ProjectPage } from "./routes/ProjectPage.js";
import { CodebasePage } from "./routes/CodebasePage.js";
import { GitPage } from "./routes/GitPage.js";
import {
  ProposalsPage,
  ProposalDetailPage,
} from "./routes/ProposalsPage.js";
import type { NotificationRecord, CodeReference } from "../lib/types.js";
import {
  type ReplayFocus,
  type Route,
  parseHashRoute,
  serializeRoute,
} from "./route.js";

export { parseHashRoute, serializeRoute };
export type { ReplayFocus, Route };

// Settings is only visited when the user explicitly opens it. Splitting it
// (with its ProfileMaintenancePanel + GatewaySettings forms) into an async
// chunk shaves form-heavy code off the eager bundle. Inline lazy decl
// keeps the wrapper-per-page boilerplate down.
const SettingsPage = lazy(() =>
  import("./routes/SettingsPage.js").then((m) => ({ default: m.SettingsPage })),
);

function parseRoute(): Route {
  return parseHashRoute(window.location.hash);
}

export function navigate(route: Route): void {
  const next = serializeRoute(route);
  // Assigning the same string would be a no-op and miss the hashchange
  // event, so we force a re-render by re-setting the route state. This
  // matters for cross-links that toggle the inspector tab on the run page
  // the user is already viewing.
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = next;
}

export function navigateToReference(input: {
  ref: CodeReference;
  runId?: string | null;
}): void {
  navigate({
    kind: "codebase",
    filePath: input.ref.file,
    line: input.ref.lineStart,
    runId: input.runId ?? null,
  });
}

function notificationRoute(n: NotificationRecord): Route {
  if (n.runId) return { kind: "run", runId: n.runId };
  if (n.taskId) return { kind: "task", taskId: n.taskId };
  return { kind: "mission" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  // Idle-time prefetch of conditional async chunks so the first user
  // interaction with them feels instant. Resolved through dynamic
  // import() to the same modules that React.lazy() will request, so
  // the bundler de-dupes and the browser's HTTP cache supplies the
  // chunk synchronously when the user actually opens Terminal / Settings.
  // Best-effort: failures are silent — a missed prefetch just means
  // the user pays the normal latency cost on first open.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      }
    ).requestIdleCallback;
    let handle: number | null = null;
    const schedule = (cb: () => void): void => {
      if (typeof ric === "function") {
        handle = ric(cb, { timeout: 4000 });
      } else {
        handle = window.setTimeout(cb, 1500);
      }
    };
    schedule(() => {
      if (cancelled) return;
      // Cheap chunk first (Settings ~22 kB). Always worth warming since
      // the user is one nav click away from it.
      void import("./routes/SettingsPage.js").catch(() => undefined);
      // Terminal chunk is ~340 kB. Only warm it when the policy is on
      // AND the driver is available — otherwise the chunk only ever
      // renders a disabled state and the prefetch is wasted bytes.
      void fetch("/api/terminal/availability", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((avail: unknown) => {
          if (cancelled || !avail || typeof avail !== "object") return;
          const a = avail as { policyEnabled?: unknown; driverAvailable?: unknown };
          if (a.policyEnabled === true && a.driverAvailable === true) {
            void import("../components/terminal/TerminalPanel.js").catch(
              () => undefined,
            );
          }
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      if (handle !== null) {
        if (typeof ric === "function") {
          const cic = (
            window as unknown as {
              cancelIdleCallback?: (handle: number) => void;
            }
          ).cancelIdleCallback;
          if (typeof cic === "function") cic(handle);
        } else {
          window.clearTimeout(handle);
        }
      }
    };
  }, []);

  // Stable URL-sync callback for CodebasePage. The previous inline
  // arrow created a new identity on every App render, which made
  // CodebasePage's `useEffect([..., onUrlChange])` re-fire on every
  // render — slamming the hash back to `#/codebase` the moment any
  // other navigation tried to set it elsewhere. That was the
  // "can't leave Codebase" bug. `navigate` is a module-scope export,
  // so the empty-deps useCallback is genuinely stable.
  const onCodebaseUrlChange = useCallback(
    (input: { path: string | null; line: number | null; runId: string | null }) => {
      navigate({
        kind: "codebase",
        filePath: input.path,
        line: input.line,
        runId: input.runId,
      });
    },
    [],
  );

  return (
    <AppShell
      currentRunId={route.kind === "run" ? route.runId : null}
      currentNav={
        route.kind === "board" || route.kind === "task"
          ? "board"
          : route.kind === "queue"
            ? "queue"
            : route.kind === "proposals" || route.kind === "proposal"
              ? "proposals"
              : route.kind === "settings"
                ? "settings"
                : route.kind === "project"
                  ? "project"
                  : route.kind === "codebase"
                    ? "codebase"
                    : route.kind === "git"
                      ? "git"
                      : route.kind === "runs"
                        ? "runs"
                        : "home"
      }
      onSelectRun={(runId) => navigate({ kind: "run", runId })}
      onShowHome={() => navigate({ kind: "mission" })}
      onShowRunsList={() => navigate({ kind: "runs" })}
      onShowBoard={() => navigate({ kind: "board" })}
      onShowQueue={() => navigate({ kind: "queue" })}
      onShowProposals={() => navigate({ kind: "proposals" })}
      onShowSettings={() => navigate({ kind: "settings" })}
      onShowProject={() => navigate({ kind: "project" })}
      onShowCodebase={() =>
        navigate({ kind: "codebase", filePath: null, line: null, runId: null })
      }
      onShowGit={() => navigate({ kind: "git", runId: null })}
      onOpenNotification={(n) => navigate(notificationRoute(n))}
    >
      {route.kind === "mission" ? (
        <MissionControlPage
          onSelectRun={(runId) => navigate({ kind: "run", runId })}
          onShowRoadmap={() => navigate({ kind: "board" })}
          onShowQueue={() => navigate({ kind: "queue" })}
          onShowRunsList={() => navigate({ kind: "runs" })}
          onShowSettings={() => navigate({ kind: "settings" })}
          onOpenTask={(taskId) => navigate({ kind: "task", taskId })}
          onShowRunDiff={(runId) =>
            navigate({ kind: "run", runId, tab: "diff" })
          }
        />
      ) : route.kind === "runs" ? (
        <RunsPage
          onSelect={(runId) => navigate({ kind: "run", runId })}
          onOpenReplay={(runId) =>
            navigate({ kind: "run", runId, tab: "replay" })
          }
        />
      ) : route.kind === "run" ? (
        <RunDetailPage
          runId={route.runId}
          initialTab={route.tab ?? null}
          replayFocus={route.replayFocus ?? null}
        />
      ) : route.kind === "board" ? (
        <BoardPage onOpenTask={(taskId) => navigate({ kind: "task", taskId })} />
      ) : route.kind === "task" ? (
        <TaskDetailPage
          taskId={route.taskId}
          onOpenRun={(runId) => navigate({ kind: "run", runId })}
          onOpenTask={(taskId) => navigate({ kind: "task", taskId })}
        />
      ) : route.kind === "queue" ? (
        <QueuePage onOpenTask={(taskId) => navigate({ kind: "task", taskId })} />
      ) : route.kind === "settings" ? (
        <Suspense
          fallback={
            <div className="px-4 py-6 text-[11.5px] text-amaco-fg-muted">
              Loading settings…
            </div>
          }
        >
          <SettingsPage />
        </Suspense>
      ) : route.kind === "project" ? (
        <ProjectPage
          onSelectRun={(runId) => navigate({ kind: "run", runId })}
          onShowQueue={() => navigate({ kind: "queue" })}
        />
      ) : route.kind === "codebase" ? (
        <CodebasePage
          initial={{
            path: route.filePath,
            line: route.line,
            runId: route.runId,
          }}
          onUrlChange={onCodebaseUrlChange}
        />
      ) : route.kind === "git" ? (
        <GitPage
          initialRunId={route.runId}
          onSelectRun={(runId) => navigate({ kind: "run", runId })}
        />
      ) : route.kind === "proposals" ? (
        <ProposalsPage
          onOpenProposal={(id) => navigate({ kind: "proposal", proposalId: id })}
        />
      ) : (
        <ProposalDetailPage
          proposalId={route.proposalId}
          onAccepted={() => navigate({ kind: "board" })}
          onBack={() => navigate({ kind: "proposals" })}
        />
      )}
      <CliHintOverlay route={route} />
    </AppShell>
  );
}
