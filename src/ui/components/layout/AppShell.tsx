import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { TopBar } from "./TopBar.js";
import type { NavId } from "./nav-id.js";
import { HelpOverlay } from "../HelpOverlay.js";
import { useServerHealth } from "../../lib/useServerHealth.js";
import type { NotificationRecord } from "../../lib/types.js";

type AppShellProps = {
  children: ReactNode;
  currentRunId: string | null;
  currentNav: NavId;
  onSelectRun: (runId: string) => void;
  onShowHome: () => void;
  onShowFlows: () => void;
  onShowGuides: () => void;
  onShowMetrics: () => void;
  onShowCrew: () => void;
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

/**
 * Mission Control v3 shell — no sidebar. The TopBar carries brand,
 * project breadcrumb, primary navigation, and the user-controls
 * cluster. Pages render inside `<main>` which is the scroll
 * container; the page body is positioned above the backdrop wash
 * (set on body in index.html) via z-10.
 */
export function AppShell({
  children,
  currentNav,
  onShowHome,
  onShowFlows,
  onShowGuides,
  onShowMetrics,
  onShowCrew,
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
    <div className="relative flex h-screen w-screen flex-col overflow-hidden text-fog-100">
      <ServerHealthBanner />
      <TopBar
        currentNav={currentNav}
        onShowHome={onShowHome}
        onShowFlows={onShowFlows}
        onShowGuides={onShowGuides}
        onShowMetrics={onShowMetrics}
        onShowCrew={onShowCrew}
        onShowRunsList={onShowRunsList}
        onShowBoard={onShowBoard}
        onShowQueue={onShowQueue}
        onShowProposals={onShowProposals}
        onShowProject={onShowProject}
        onShowCodebase={onShowCodebase}
        onShowGit={onShowGit}
        onShowSettings={onShowSettings}
        onOpenNotification={onOpenNotification}
      />
      <main className="relative z-10 flex-1 overflow-y-auto">{children}</main>
      <HelpOverlay />
    </div>
  );
}

/**
 * Loud-by-default banner shown whenever the local amaco server stops
 * answering /api/health. Kept above the TopBar so it cannot be missed.
 */
function ServerHealthBanner() {
  const { reachable, lastCheckedAt } = useServerHealth();
  if (reachable) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-rose-400/40 bg-rose-500/10 px-4 py-1.5 text-[12px] text-rose-300"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="font-medium">amaco ui is unreachable.</span>
      <span className="text-rose-300/80">
        The server at this origin stopped answering /api/health
        {" "}
        — restart it with{" "}
        <code className="mono rounded bg-rose-500/15 px-1">amaco ui</code>
        {" "}from the project root and refresh.
      </span>
      <span className="mono ml-auto text-[10.5px] opacity-70">
        last checked {lastCheckedAt.toLocaleTimeString()}
      </span>
    </div>
  );
}
