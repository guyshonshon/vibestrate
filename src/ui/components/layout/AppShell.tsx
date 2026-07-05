import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Sidebar } from "./Sidebar.js";
import type { NavId } from "./nav-id.js";
import { HelpOverlay } from "../HelpOverlay.js";
import { useServerHealth } from "../../lib/useServerHealth.js";
import type { NotificationRecord } from "../../lib/types.js";

type AppShellProps = {
  children: ReactNode;
  /**
   * Chromeless mode: render only the page + the global overlays (children),
   * dropping the sidebar. Used by focused surfaces that bring their own frame
   * (e.g. the single-run control view).
   */
  bare?: boolean;
  currentRunId: string | null;
  currentNav: NavId;
  onSelectRun: (runId: string) => void;
  onShowHome: () => void;
  onShowCompose: () => void;
  onShowFlows: () => void;
  onShowMetrics: () => void;
  onShowCrew: () => void;
  onShowSupervisors: () => void;
  onShowProfiles: () => void;
  onShowRunsList: () => void;
  onShowBoard: () => void;
  onShowQueue: () => void;
  onShowWorkspace: () => void;
  onShowProposals: () => void;
  onShowSettings: () => void;
  onShowPolicies: () => void;
  onShowProject: () => void;
  onShowConfig: () => void;
  onShowCanvas: () => void;
  onShowCodebase: () => void;
  onShowGit: () => void;
  onShowGitTree: () => void;
  onShowMerge: () => void;
  onShowLedger: () => void;
  onShowConsult: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
};

/**
 * The single app-wide shell. Mission Control is the source of truth for the
 * product's look, so its left `Sidebar` - not a horizontal top bar - is the
 * chrome every page renders inside. Pages render in `<main>`, the scroll
 * container, positioned above the backdrop wash (set on body in index.html)
 * via z-10. `bare` keeps the chromeless escape hatch for focused surfaces
 * (e.g. the single-run control view).
 */
export function AppShell({
  children,
  bare = false,
  currentNav,
  onShowHome,
  onShowCompose,
  onShowFlows,
  onShowMetrics,
  onShowCrew,
  onShowSupervisors,
  onShowProfiles,
  onShowRunsList,
  onShowBoard,
  onShowWorkspace,
  onShowProposals,
  onShowSettings,
  onShowPolicies,
  onShowProject,
  onShowConfig,
  onShowCanvas,
  onShowCodebase,
  onShowGit,
  onShowGitTree,
  onShowMerge,
  onShowLedger,
  onOpenNotification,
}: AppShellProps) {
  if (bare) {
    return (
      <div className="relative h-screen w-screen overflow-y-auto">
        <ServerHealthBanner />
        {children}
        <HelpOverlay />
      </div>
    );
  }
  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-coal-800 text-chalk-100">
      <ServerHealthBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          currentNav={currentNav}
          onShowHome={onShowHome}
          onShowCompose={onShowCompose}
          onShowFlows={onShowFlows}
          onShowMetrics={onShowMetrics}
          onShowCrew={onShowCrew}
          onShowSupervisors={onShowSupervisors}
          onShowProfiles={onShowProfiles}
          onShowRunsList={onShowRunsList}
          onShowBoard={onShowBoard}
          onShowWorkspace={onShowWorkspace}
          onShowProposals={onShowProposals}
          onShowProject={onShowProject}
          onShowConfig={onShowConfig}
          onShowCanvas={onShowCanvas}
          onShowCodebase={onShowCodebase}
          onShowGit={onShowGit}
          onShowGitTree={onShowGitTree}
          onShowMerge={onShowMerge}
          onShowLedger={onShowLedger}
          onShowSettings={onShowSettings}
          onShowPolicies={onShowPolicies}
          onOpenNotification={onOpenNotification}
        />
        <main className="relative z-10 flex-1 overflow-y-auto">{children}</main>
      </div>
      <HelpOverlay />
    </div>
  );
}

/**
 * Loud-by-default banner shown whenever the local vibestrate server stops
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
      <span className="font-medium">vibe ui is unreachable.</span>
      <span className="text-rose-300/80">
        The server at this origin stopped answering /api/health
        {" "}
        - restart it with{" "}
        <code className="mono rounded bg-rose-500/15 px-1">vibe ui</code>
        {" "}from the project root and refresh.
      </span>
      <span className="mono ml-auto text-[10.5px] opacity-70">
        last checked {lastCheckedAt.toLocaleTimeString()}
      </span>
    </div>
  );
}
