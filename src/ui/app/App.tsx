import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell.js";
import { RunsPage } from "./routes/RunsPage.js";
import { RunDetailPage } from "./routes/RunDetailPage.js";
import { BoardPage } from "./routes/BoardPage.js";
import { TaskDetailPage } from "./routes/TaskDetailPage.js";
import { QueuePage } from "./routes/QueuePage.js";

type Route =
  | { kind: "runs" }
  | { kind: "run"; runId: string }
  | { kind: "board" }
  | { kind: "task"; taskId: string }
  | { kind: "queue" };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "runs" && parts[1]) return { kind: "run", runId: parts[1] };
  if (parts[0] === "board") return { kind: "board" };
  if (parts[0] === "tasks" && parts[1]) return { kind: "task", taskId: parts[1] };
  if (parts[0] === "queue") return { kind: "queue" };
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
  }
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
            : "runs"
      }
      onSelectRun={(runId) => navigate({ kind: "run", runId })}
      onShowRunsList={() => navigate({ kind: "runs" })}
      onShowBoard={() => navigate({ kind: "board" })}
      onShowQueue={() => navigate({ kind: "queue" })}
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
        />
      ) : (
        <QueuePage onOpenTask={(taskId) => navigate({ kind: "task", taskId })} />
      )}
    </AppShell>
  );
}
