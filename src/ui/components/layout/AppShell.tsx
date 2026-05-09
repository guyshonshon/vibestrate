import type { ReactNode } from "react";
import { Sidebar, type NavId } from "./Sidebar.js";

type AppShellProps = {
  children: ReactNode;
  currentRunId: string | null;
  currentNav: NavId;
  onSelectRun: (runId: string) => void;
  onShowRunsList: () => void;
  onShowBoard: () => void;
  onShowQueue: () => void;
};

export function AppShell({
  children,
  currentRunId,
  currentNav,
  onSelectRun,
  onShowRunsList,
  onShowBoard,
  onShowQueue,
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
      />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
