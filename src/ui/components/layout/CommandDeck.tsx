import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  Box,
  Code2,
  Command,
  FileText,
  FolderTree,
  GitCommit,
  HelpCircle,
  History,
  LayoutGrid,
  ListChecks,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { NotificationRecord, RunState, RunStatus } from "../../lib/types.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
import { RunStatusBadge } from "../runs/RunStatusBadge.js";

export type NavId =
  | "home"
  | "runs"
  | "board"
  | "queue"
  | "proposals"
  | "settings"
  | "project"
  | "codebase"
  | "git";

type CommandDeckProps = {
  currentRunId: string | null;
  currentNav: NavId;
  screen: { title: string; subtitle: string };
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

type NavItem = {
  id: NavId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  onClick: () => void;
};

const ACTIVE_STATUSES: RunStatus[] = [
  "created",
  "planning",
  "planned",
  "architecting",
  "architected",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "waiting_for_approval",
  "paused",
];

export function CommandDeck({
  currentRunId,
  currentNav,
  screen,
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
}: CommandDeckProps) {
  const [runs, setRuns] = useState<RunState[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.listRuns();
        if (!cancelled) setRuns([...data].reverse());
      } catch {
        // Server may still be booting. Keep the last good run list.
      }
    };
    void load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const primaryNav: NavItem[] = [
    { id: "home", label: "Mission Control", shortLabel: "Mission", icon: Command, onClick: onShowHome },
    { id: "queue", label: "Queue", shortLabel: "Queue", icon: ListChecks, onClick: onShowQueue },
    { id: "board", label: "Board", shortLabel: "Board", icon: LayoutGrid, onClick: onShowBoard },
    { id: "runs", label: "Runs", shortLabel: "Runs", icon: History, onClick: onShowRunsList },
  ];
  const inspectNav: NavItem[] = [
    { id: "codebase", label: "Codebase", shortLabel: "Code", icon: FolderTree, onClick: onShowCodebase },
    { id: "git", label: "Git", shortLabel: "Git", icon: GitCommit, onClick: onShowGit },
    { id: "project", label: "Project", shortLabel: "Project", icon: Box, onClick: onShowProject },
    { id: "proposals", label: "Proposals", shortLabel: "Plans", icon: FileText, onClick: onShowProposals },
  ];

  const activeRuns = runs.filter((run) => ACTIVE_STATUSES.includes(run.status));
  const runStrip = activeRuns.length > 0 ? activeRuns : runs.slice(0, 8);

  return (
    <header className="shrink-0 border-b border-amaco-border bg-amaco-panel">
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(13rem,0.65fr)_minmax(0,1.45fr)_auto] lg:items-center">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onShowHome}
            className="group flex min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-amaco-panel-2 focus:outline-none focus:ring-1 focus:ring-amaco-accent"
            aria-label="Open Mission Control"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-amaco-border bg-amaco-canvas text-amaco-accent">
              <Activity className="h-4 w-4" strokeWidth={1.7} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-amaco-fg">
                amaco
              </span>
              <span className="amaco-mono block truncate text-[10.5px] text-amaco-fg-muted">
                local CLI orchestrator
              </span>
            </span>
          </button>
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <BackButton onShowHome={onShowHome} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Code2
                  className="h-3.5 w-3.5 shrink-0 text-amaco-accent"
                  strokeWidth={1.6}
                  aria-hidden
                />
                <span className="truncate text-[14px] font-medium text-amaco-fg">
                  {screen.title}
                </span>
              </div>
              <div
                className="amaco-mono mt-0.5 truncate text-[10.5px] text-amaco-fg-muted"
                title={screen.subtitle}
              >
                {screen.subtitle}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1">
          <ToolButton
            label="Keyboard shortcuts"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("amaco:help-overlay"))
            }
          >
            <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
          </ToolButton>
          <NotificationBell onOpenNotification={onOpenNotification} />
          <ToolButton
            label="Settings"
            active={currentNav === "settings"}
            onClick={onShowSettings}
          >
            <SettingsIcon className="h-4 w-4" strokeWidth={1.5} />
          </ToolButton>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-amaco-border-soft px-4 py-2 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="amaco-mono mr-1 text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            command
          </span>
          {primaryNav.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={isNavActive(item.id, currentNav, currentRunId)}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-amaco-border-soft" aria-hidden />
          <span className="amaco-mono mr-1 text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            inspect
          </span>
          {inspectNav.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={isNavActive(item.id, currentNav, currentRunId)}
            />
          ))}
        </div>

        <RunStrip
          runs={runStrip}
          showingActive={activeRuns.length > 0}
          totalRuns={runs.length}
          currentRunId={currentRunId}
          onSelectRun={onSelectRun}
        />
      </div>
    </header>
  );
}

function isNavActive(
  id: NavId,
  currentNav: NavId,
  currentRunId: string | null,
): boolean {
  if (id === "runs") return currentNav === "runs" || currentRunId !== null;
  return currentNav === id;
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
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else onShowHome();
      }}
      title={canGoBack ? "Back" : "Back to Mission Control"}
      aria-label="Back"
      className="grid h-8 w-8 shrink-0 place-items-center rounded text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg focus:outline-none focus:ring-1 focus:ring-amaco-accent"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
    </button>
  );
}

function ToolButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded focus:outline-none focus:ring-1 focus:ring-amaco-accent ${
        active
          ? "bg-amaco-accent/15 text-amaco-accent"
          : "text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg"
      }`}
    >
      {children}
    </button>
  );
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onClick}
      title={item.label}
      className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-[12px] transition-colors focus:outline-none focus:ring-1 focus:ring-amaco-accent ${
        active
          ? "border-amaco-accent/45 bg-amaco-accent/15 text-amaco-accent"
          : "border-transparent text-amaco-fg-dim hover:border-amaco-border hover:bg-amaco-panel-2 hover:text-amaco-fg"
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.55} aria-hidden />
      <span>{item.shortLabel}</span>
    </button>
  );
}

function RunStrip({
  runs,
  showingActive,
  totalRuns,
  currentRunId,
  onSelectRun,
}: {
  runs: RunState[];
  showingActive: boolean;
  totalRuns: number;
  currentRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1 xl:max-w-[48rem]">
      <div className="flex items-center gap-2">
        <span className="amaco-mono shrink-0 text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          {showingActive ? "active runs" : "recent runs"}
        </span>
        {runs.length === 0 ? (
          <span className="text-[11.5px] text-amaco-fg-muted">
            No runs yet.
          </span>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5">
            {runs.map((run) => (
              <button
                key={run.runId}
                type="button"
                onClick={() => onSelectRun(run.runId)}
                title={`${run.task} (${run.runId})`}
                className={`inline-flex max-w-[15rem] shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-left text-[11.5px] transition-colors focus:outline-none focus:ring-1 focus:ring-amaco-accent ${
                  currentRunId === run.runId
                    ? "border-amaco-accent/45 bg-amaco-accent/15 text-amaco-fg"
                    : "border-amaco-border bg-amaco-canvas text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg"
                }`}
              >
                <RunStatusBadge status={run.status} compact />
                <span className="truncate">{run.task}</span>
              </button>
            ))}
          </div>
        )}
        <span className="amaco-mono shrink-0 text-[10.5px] text-amaco-fg-muted">
          {totalRuns}
        </span>
      </div>
    </div>
  );
}
