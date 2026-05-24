import { type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { CommandDeck, type NavId } from "./CommandDeck.js";
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
  const screen = currentRunId
    ? {
        title: "Run inspection",
        subtitle: currentRunId,
      }
    : NAV_META[currentNav];

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-amaco-canvas text-amaco-fg">
      <ServerHealthBanner />
      <CommandDeck
        currentRunId={currentRunId}
        currentNav={currentNav}
        screen={screen}
        onSelectRun={onSelectRun}
        onShowHome={onShowHome}
        onShowRunsList={onShowRunsList}
        onShowBoard={onShowBoard}
        onShowQueue={onShowQueue}
        onShowProposals={onShowProposals}
        onShowSettings={onShowSettings}
        onShowProject={onShowProject}
        onShowCodebase={onShowCodebase}
        onShowGit={onShowGit}
        onOpenNotification={onOpenNotification}
      />
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
      <HelpOverlay />
    </div>
  );
}

const NAV_META: Record<NavId, { title: string; subtitle: string }> = {
  home: {
    title: "Mission Control",
    subtitle: "Launch runs, choose flow templates, watch active CLI work.",
  },
  runs: {
    title: "Runs",
    subtitle: "Historical execution ledger and replay entry point.",
  },
  board: {
    title: "Task Board",
    subtitle: "Roadmap items, queued work, priorities, dependencies.",
  },
  queue: {
    title: "Queue",
    subtitle: "Scheduler intake, blocked tasks, pending execution.",
  },
  proposals: {
    title: "Proposals",
    subtitle: "Planner drafts waiting to become tracked work.",
  },
  settings: {
    title: "Settings",
    subtitle: "Providers, validation profiles, notifications, policy defaults.",
  },
  project: {
    title: "Project",
    subtitle: "Repository metadata, detected commands, Amaco config.",
  },
  codebase: {
    title: "Codebase",
    subtitle: "Read-only tree, files, references, and profile maintenance.",
  },
  git: {
    title: "Git",
    subtitle: "Worktree-aware branch, status, and commit activity.",
  },
};

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
        The server at this origin stopped answering /api/health. Restart it with{" "}
        <code className="amaco-mono rounded bg-amaco-fail/15 px-1">amaco ui</code>
        {" "}from the project root and refresh.
      </span>
      <span className="amaco-mono ml-auto text-[10.5px] opacity-70">
        last checked {lastCheckedAt.toLocaleTimeString()}
      </span>
    </div>
  );
}
