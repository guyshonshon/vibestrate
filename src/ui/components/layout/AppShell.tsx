import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar.js";

type AppShellProps = {
  children: ReactNode;
  currentRunId: string | null;
  onSelectRun: (runId: string) => void;
  onShowRunsList: () => void;
};

export function AppShell({
  children,
  currentRunId,
  onSelectRun,
  onShowRunsList,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-amaco-canvas text-amaco-fg">
      <Sidebar
        currentRunId={currentRunId}
        onSelectRun={onSelectRun}
        onShowRunsList={onShowRunsList}
      />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
