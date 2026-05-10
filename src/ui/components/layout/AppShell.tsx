import type { ReactNode } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Sidebar, type NavId } from "./Sidebar.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
import type { NotificationRecord } from "../../lib/types.js";

type AppShellProps = {
  children: ReactNode;
  currentRunId: string | null;
  currentNav: NavId;
  onSelectRun: (runId: string) => void;
  onShowRunsList: () => void;
  onShowBoard: () => void;
  onShowQueue: () => void;
  onShowProposals: () => void;
  onShowSettings: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
};

export function AppShell({
  children,
  currentRunId,
  currentNav,
  onSelectRun,
  onShowRunsList,
  onShowBoard,
  onShowQueue,
  onShowProposals,
  onShowSettings,
  onOpenNotification,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-amaco-canvas text-amaco-fg">
      <Sidebar
        currentRunId={currentRunId}
        currentNav={currentNav}
        onSelectRun={onSelectRun}
        onShowRunsList={onShowRunsList}
        onShowBoard={onShowBoard}
        onShowQueue={onShowQueue}
        onShowProposals={onShowProposals}
      />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-1 border-b border-amaco-border bg-amaco-panel/40 px-3 py-1.5">
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
