import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell.js";
import { RunsPage } from "./routes/RunsPage.js";
import { RunDetailPage } from "./routes/RunDetailPage.js";
import { BoardPage } from "./routes/BoardPage.js";
import { TaskDetailPage } from "./routes/TaskDetailPage.js";
import { QueuePage } from "./routes/QueuePage.js";
import { SettingsPage } from "./routes/SettingsPage.js";
import {
  ProposalsPage,
  ProposalDetailPage,
} from "./routes/ProposalsPage.js";
import type { NotificationRecord } from "../lib/types.js";

type Route =
  | { kind: "runs" }
  | { kind: "run"; runId: string }
  | { kind: "board" }
  | { kind: "task"; taskId: string }
  | { kind: "queue" }
  | { kind: "proposals" }
  | { kind: "proposal"; proposalId: string }
  | { kind: "settings" };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "runs" && parts[1]) return { kind: "run", runId: parts[1] };
  if (parts[0] === "board") return { kind: "board" };
  if (parts[0] === "tasks" && parts[1]) return { kind: "task", taskId: parts[1] };
  if (parts[0] === "queue") return { kind: "queue" };
  if (parts[0] === "settings") return { kind: "settings" };
  if (parts[0] === "proposals" && parts[1])
    return { kind: "proposal", proposalId: parts.slice(1).join("/") };
  if (parts[0] === "proposals") return { kind: "proposals" };
  return { kind: "runs" };
}

export function navigate(route: Route): void {
  switch (route.kind) {
    case "runs":
      window.location.hash = "#/";
      break;
    case "run":
      window.location.hash = `#/runs/${route.runId}`;
      break;
    case "board":
      window.location.hash = "#/board";
      break;
    case "task":
      window.location.hash = `#/tasks/${route.taskId}`;
      break;
    case "queue":
      window.location.hash = "#/queue";
      break;
    case "proposals":
      window.location.hash = "#/proposals";
      break;
    case "proposal":
      window.location.hash = `#/proposals/${route.proposalId}`;
      break;
    case "settings":
      window.location.hash = "#/settings";
      break;
  }
}

function notificationRoute(n: NotificationRecord): Route {
  if (n.runId) return { kind: "run", runId: n.runId };
  if (n.taskId) return { kind: "task", taskId: n.taskId };
  return { kind: "runs" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

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
                : "runs"
      }
      onSelectRun={(runId) => navigate({ kind: "run", runId })}
      onShowRunsList={() => navigate({ kind: "runs" })}
      onShowBoard={() => navigate({ kind: "board" })}
      onShowQueue={() => navigate({ kind: "queue" })}
      onShowProposals={() => navigate({ kind: "proposals" })}
      onShowSettings={() => navigate({ kind: "settings" })}
      onOpenNotification={(n) => navigate(notificationRoute(n))}
    >
      {route.kind === "runs" ? (
        <RunsPage onSelect={(runId) => navigate({ kind: "run", runId })} />
      ) : route.kind === "run" ? (
        <RunDetailPage runId={route.runId} />
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
        <SettingsPage />
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
    </AppShell>
  );
}
