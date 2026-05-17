import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { Sidebar, type NavId } from "./Sidebar.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
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
        <header className="flex items-center gap-1 border-b border-amaco-border bg-amaco-panel/40 px-3 py-1.5">
          <BackButton onShowHome={onShowHome} />
          <span className="ml-auto" />
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
