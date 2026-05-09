import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell.js";
import { RunsPage } from "./routes/RunsPage.js";
import { RunDetailPage } from "./routes/RunDetailPage.js";

type Route =
  | { kind: "runs" }
  | { kind: "run"; runId: string };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "runs" && parts[1]) return { kind: "run", runId: parts[1] };
  return { kind: "runs" };
}

export function navigate(route: Route): void {
  if (route.kind === "runs") {
    window.location.hash = "#/";
  } else {
    window.location.hash = `#/runs/${route.runId}`;
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
      onSelectRun={(runId) => navigate({ kind: "run", runId })}
      onShowRunsList={() => navigate({ kind: "runs" })}
    >
      {route.kind === "runs" ? (
        <RunsPage onSelect={(runId) => navigate({ kind: "run", runId })} />
      ) : (
        <RunDetailPage runId={route.runId} />
      )}
    </AppShell>
  );
}
