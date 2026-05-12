import { lazy, Suspense, useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell.js";
import { RunsPage } from "./routes/RunsPage.js";
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

// Settings is only visited when the user explicitly opens it. Splitting it
// (with its ProfileMaintenancePanel + GatewaySettings forms) into an async
// chunk shaves form-heavy code off the eager bundle. Inline lazy decl
// keeps the wrapper-per-page boilerplate down.
const SettingsPage = lazy(() =>
  import("./routes/SettingsPage.js").then((m) => ({ default: m.SettingsPage })),
);

type Route =
  | { kind: "runs" }
  | { kind: "run"; runId: string }
  | { kind: "board" }
  | { kind: "task"; taskId: string }
  | { kind: "queue" }
  | { kind: "proposals" }
  | { kind: "proposal"; proposalId: string }
  | { kind: "settings" }
  | { kind: "project" }
  | {
      kind: "codebase";
      filePath: string | null;
      line: number | null;
      runId: string | null;
    }
  | { kind: "git"; runId: string | null };

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = (pathPart ?? "").split("/").filter(Boolean);
  const query = new URLSearchParams(queryPart ?? "");
  if (parts[0] === "runs" && parts[1]) return { kind: "run", runId: parts[1] };
  if (parts[0] === "board") return { kind: "board" };
  if (parts[0] === "tasks" && parts[1]) return { kind: "task", taskId: parts[1] };
  if (parts[0] === "queue") return { kind: "queue" };
  if (parts[0] === "settings") return { kind: "settings" };
  if (parts[0] === "project") return { kind: "project" };
  if (parts[0] === "codebase") {
    const filePath = query.get("path");
    const lineStr = query.get("line");
    const runId = query.get("runId");
    return {
      kind: "codebase",
      filePath: filePath ?? null,
      line: lineStr ? Number(lineStr) || null : null,
      runId: runId ?? null,
    };
  }
  if (parts[0] === "git") {
    const runId = query.get("runId");
    return { kind: "git", runId: runId ?? null };
  }
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
    case "project":
      window.location.hash = "#/project";
      break;
    case "codebase": {
      const q = new URLSearchParams();
      if (route.filePath) q.set("path", route.filePath);
      if (route.line !== null) q.set("line", String(route.line));
      if (route.runId) q.set("runId", route.runId);
      const qs = q.toString();
      window.location.hash = `#/codebase${qs ? `?${qs}` : ""}`;
      break;
    }
    case "git": {
      const q = new URLSearchParams();
      if (route.runId) q.set("runId", route.runId);
      const qs = q.toString();
      window.location.hash = `#/git${qs ? `?${qs}` : ""}`;
      break;
    }
  }
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
                : route.kind === "project"
                  ? "project"
                  : route.kind === "codebase"
                    ? "codebase"
                    : route.kind === "git"
                      ? "git"
                      : "runs"
      }
      onSelectRun={(runId) => navigate({ kind: "run", runId })}
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
          onUrlChange={(input) =>
            navigate({
              kind: "codebase",
              filePath: input.path,
              line: input.line,
              runId: input.runId,
            })
          }
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
    </AppShell>
  );
}
