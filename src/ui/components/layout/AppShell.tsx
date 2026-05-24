import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  HelpCircle,
  Settings as SettingsIcon,
} from "lucide-react";
import { Sidebar, type NavId } from "./Sidebar.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
import { HelpOverlay } from "../HelpOverlay.js";
import { useServerHealth } from "../../lib/useServerHealth.js";
import type { NotificationRecord } from "../../lib/types.js";

type AppShellProps = {
  children: ReactNode;
  currentRunId: string | null;
  currentNav: NavId;
  onSelectRun: (runId: string) => void;
  onShowHome: () => void;
  onShowRunsList: () => void;
  onShowBoard: () => void;
  onShowQueue: () => void;
  onShowProposals: () => void;
  onShowSettings: () => void;
  onShowProject: () => void;
  onShowCodebase: () => void;
  onShowGit: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
};

export function AppShell({
  children,
  currentRunId,
  currentNav,
  onSelectRun,
  onShowHome,
  onShowRunsList,
  onShowBoard,
  onShowQueue,
  onShowProposals,
  onShowSettings,
  onShowProject,
  onShowCodebase,
  onShowGit,
  onOpenNotification,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-amaco-canvas text-amaco-fg">
      <Sidebar
        currentRunId={currentRunId}
        currentNav={currentNav}
        onSelectRun={onSelectRun}
        onShowHome={onShowHome}
        onShowRunsList={onShowRunsList}
        onShowBoard={onShowBoard}
        onShowQueue={onShowQueue}
        onShowProposals={onShowProposals}
        onShowProject={onShowProject}
        onShowCodebase={onShowCodebase}
        onShowGit={onShowGit}
      />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <ServerHealthBanner />
        <header className="flex items-center gap-1 border-b border-amaco-border bg-amaco-panel/40 px-3 py-1.5">
          <BackButton onShowHome={onShowHome} />
          <span className="ml-auto" />
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("amaco:help-overlay"))
            }
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            className="rounded p-1.5 text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg focus:outline-none focus:ring-1 focus:ring-amaco-accent"
          >
            <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <NotificationBell onOpenNotification={onOpenNotification} />
          <button
            type="button"
            onClick={onShowSettings}
            className={`rounded p-1.5 hover:bg-amaco-panel-2 hover:text-amaco-fg ${
              currentNav === "settings" ? "text-amaco-fg" : "text-amaco-fg-dim"
            }`}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
      <HelpOverlay />
    </div>
  );
}

/**
 * Header Back button. Uses browser history (hash-based routing means
 * Back lands on the previous in-app route). Disabled when there's no
 * history to go back to — falls through to Home when clicked anyway
 * so the user always has an out. Listens for `popstate` so the
 * disabled state stays correct as the user navigates.
 */
/**
 * Loud-by-default banner shown whenever the local amaco server stops
 * answering /api/health. Surfaces the "the dashboard is talking to a
 * server that's gone" state instead of letting every page silently
 * spin on ERR_CONNECTION_REFUSED. The Codebase tab's reconnect storm
 * used to be misread as a freeze; now you see the cause at the top
 * of the window the moment it happens.
 */
function ServerHealthBanner() {
  const { reachable, lastCheckedAt } = useServerHealth();
  if (reachable) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-amaco-fail/40 bg-amaco-fail/10 px-4 py-1.5 text-[12px] text-amaco-fail"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="font-medium">amaco ui is unreachable.</span>
      <span className="text-amaco-fail/80">
        The server at this origin stopped answering /api/health
        {" "}
        — restart it with{" "}
        <code className="amaco-mono rounded bg-amaco-fail/15 px-1">amaco ui</code>
        {" "}from the project root and refresh.
      </span>
      <span className="amaco-mono ml-auto text-[10.5px] opacity-70">
        last checked {lastCheckedAt.toLocaleTimeString()}
      </span>
    </div>
  );
}

function BackButton({ onShowHome }: { onShowHome: () => void }) {
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    const update = () => setCanGoBack(window.history.length > 1);
    update();
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);
  const onClick = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      onShowHome();
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={canGoBack ? "Back (browser history)" : "Back to Home"}
      aria-label="Back"
      className="rounded p-1.5 text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg focus:outline-none focus:ring-1 focus:ring-amaco-accent"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
    </button>
  );
}
