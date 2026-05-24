import { useEffect, useState } from "react";
import { usePersistedState } from "../../lib/usePersistedState.js";
import {
  GitBranch,
  Home,
  History,
  Folder,
  Activity,
  LayoutGrid,
  ListChecks,
  FileText,
  FolderTree,
  GitCommit,
  Box,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { RunState } from "../../lib/types.js";
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

type Props = {
  currentRunId: string | null;
  currentNav: NavId;
  onSelectRun: (runId: string) => void;
  onShowHome: () => void;
  onShowRunsList: () => void;
  onShowBoard: () => void;
  onShowQueue: () => void;
  onShowProposals: () => void;
  onShowProject: () => void;
  onShowCodebase: () => void;
  onShowGit: () => void;
};

type NavItem = {
  id: NavId;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
};

export function Sidebar({
  currentRunId,
  currentNav,
  onSelectRun,
  onShowHome,
  onShowRunsList,
  onShowBoard,
  onShowQueue,
  onShowProposals,
  onShowProject,
  onShowCodebase,
  onShowGit,
}: Props) {
  const [runs, setRuns] = useState<RunState[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.listRuns();
        if (!cancelled) setRuns([...data].reverse());
      } catch {
        // ignore — server may not be ready yet
      }
    };
    void load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const currentRun =
    currentRunId !== null
      ? runs.find((r) => r.runId === currentRunId) ?? null
      : null;

  // Sidebar width is user-controllable via a drag handle on the right
  // edge. Persisted per-browser; clamped to a sensible range so the
  // page stays usable.
  const [width, setWidth] = usePersistedState<number>(
    "amaco.sidebar.width",
    288, // px — matches the previous Tailwind w-72
  );
  const startDrag = (clientX: number) => {
    const startWidth = width;
    const startX = clientX;
    const onMove = (e: MouseEvent) => {
      const next = startWidth + (e.clientX - startX);
      setWidth(Math.max(200, Math.min(560, next)));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const activeRuns = runs.filter((run) =>
    [
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
    ].includes(run.status),
  ).length;
  const primaryNav: NavItem[] = [
    { id: "home", label: "Mission", icon: Home, onClick: onShowHome },
    { id: "queue", label: "Queue", icon: ListChecks, onClick: onShowQueue },
    { id: "board", label: "Board", icon: LayoutGrid, onClick: onShowBoard },
    { id: "runs", label: "Runs", icon: History, onClick: onShowRunsList },
  ];
  const inspectNav: NavItem[] = [
    { id: "codebase", label: "Codebase", icon: FolderTree, onClick: onShowCodebase },
    { id: "git", label: "Git", icon: GitCommit, onClick: onShowGit },
    { id: "project", label: "Project", icon: Box, onClick: onShowProject },
    { id: "proposals", label: "Proposals", icon: FileText, onClick: onShowProposals },
  ];

  return (
    <aside
      className="relative grid shrink-0 grid-cols-[3.5rem_minmax(0,1fr)] border-r border-amaco-border bg-amaco-panel"
      style={{ width }}
      aria-label="Sidebar"
    >
      <nav className="flex min-w-0 flex-col items-center gap-1 border-r border-amaco-border-soft bg-amaco-canvas px-1.5 py-3">
        <button
          type="button"
          onClick={onShowHome}
          className="mb-2 grid h-9 w-9 place-items-center rounded border border-amaco-border bg-amaco-panel text-amaco-accent hover:bg-amaco-panel-2 focus:outline-none focus:ring-1 focus:ring-amaco-accent"
          title="Mission Control"
          aria-label="Mission Control"
        >
          <Activity className="h-4 w-4" strokeWidth={1.7} />
        </button>
        {primaryNav.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={isNavActive(item.id, currentNav, currentRunId)}
          />
        ))}
        <div className="my-1 h-px w-6 bg-amaco-border-soft" />
        {inspectNav.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={isNavActive(item.id, currentNav, currentRunId)}
          />
        ))}
      </nav>

      <div className="flex min-w-0 flex-col">
        <header className="border-b border-amaco-border-soft px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="amaco-mono text-[10.5px] uppercase tracking-[0.16em] text-amaco-fg-muted">
              amaco
            </span>
            <span className="ml-auto rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 amaco-mono text-[10px] text-amaco-fg-dim">
              {activeRuns} active
            </span>
          </div>
          <div className="mt-1 text-[13px] font-medium text-amaco-fg">
            Local agent operations
          </div>
        </header>

        <section className="border-b border-amaco-border-soft px-2 py-2">
          <div className="px-1 pb-1.5 text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            command
          </div>
          <div className="space-y-1">
            {primaryNav.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={isNavActive(item.id, currentNav, currentRunId)}
              />
            ))}
          </div>
          <div className="px-1 pb-1.5 pt-3 text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
            inspect
          </div>
          <div className="space-y-1">
            {inspectNav.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={isNavActive(item.id, currentNav, currentRunId)}
              />
            ))}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-amaco-fg-muted">
              run stack
            </span>
            <span className="ml-auto amaco-mono text-[10.5px] text-amaco-fg-muted">
              {runs.length} total
            </span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {runs.length === 0 ? (
              <li className="rounded border border-dashed border-amaco-border px-2 py-2 text-[12px] text-amaco-fg-muted">
                No runs yet. Start one from Mission Control.
              </li>
            ) : (
              runs.slice(0, 28).map((run) => (
                <li key={run.runId}>
                  <button
                    onClick={() => onSelectRun(run.runId)}
                    className={`group flex w-full flex-col gap-1 rounded px-2 py-2 text-left transition-colors hover:bg-amaco-panel-2 ${
                      currentRunId === run.runId ? "bg-amaco-panel-2" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RunStatusBadge status={run.status} compact />
                      <span className="truncate text-[12.5px] text-amaco-fg">
                        {run.task}
                      </span>
                    </div>
                    <span className="amaco-mono truncate text-[11px] text-amaco-fg-muted">
                      {run.runId}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        {currentRun ? (
          <div className="border-t border-amaco-border bg-amaco-panel-2 px-3 py-3 text-[11.5px] text-amaco-fg-dim">
            <div className="mb-1.5 truncate text-[12.5px] text-amaco-fg">
              {currentRun.task}
            </div>
            <div className="flex items-center gap-1.5">
              <RunStatusBadge status={currentRun.status} />
              {currentRun.finalDecision ? (
                <span className="amaco-mono rounded border border-amaco-border px-1 text-[10.5px] text-amaco-fg-dim">
                  {currentRun.finalDecision}
                </span>
              ) : null}
              {currentRun.verification ? (
                <span className="amaco-mono rounded border border-amaco-border px-1 text-[10.5px] text-amaco-fg-dim">
                  {currentRun.verification}
                </span>
              ) : null}
            </div>
            {currentRun.branchName ? (
              <div className="mt-2 flex items-center gap-1.5">
                <GitBranch className="h-3 w-3" strokeWidth={1.5} />
                <span className="amaco-mono truncate">
                  {currentRun.branchName}
                </span>
              </div>
            ) : null}
            {currentRun.worktreePath ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Folder className="h-3 w-3" strokeWidth={1.5} />
                <span className="amaco-mono truncate">
                  {currentRun.worktreePath}
                </span>
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-x-3 text-[11px] text-amaco-fg-muted">
              <span>started</span>
              <span className="amaco-mono text-right">
                {new Date(currentRun.startedAt).toLocaleTimeString()}
              </span>
              <span>updated</span>
              <span className="amaco-mono text-right">
                {new Date(currentRun.updatedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ) : null}

      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={0}
        onMouseDown={(e) => {
          e.preventDefault();
          startDrag(e.clientX);
        }}
        onDoubleClick={() => setWidth(288)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth(Math.max(200, width - 16));
          else if (e.key === "ArrowRight") setWidth(Math.min(560, width + 16));
        }}
        className="group absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-amaco-accent/40 focus:bg-amaco-accent/60 focus:outline-none"
        title="Drag to resize, double-click to reset"
      />
    </aside>
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

function RailButton({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onClick}
      title={item.label}
      aria-label={item.label}
      className={`grid h-9 w-9 place-items-center rounded transition-colors focus:outline-none focus:ring-1 focus:ring-amaco-accent ${
        active
          ? "bg-amaco-accent/15 text-amaco-accent"
          : "text-amaco-fg-muted hover:bg-amaco-panel-2 hover:text-amaco-fg"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors focus:outline-none focus:ring-1 focus:ring-amaco-accent ${
        active
          ? "bg-amaco-accent/15 text-amaco-fg"
          : "text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg"
      }`}
    >
      <Icon
        className={active ? "h-3.5 w-3.5 text-amaco-accent" : "h-3.5 w-3.5"}
        strokeWidth={1.55}
        aria-hidden
      />
      <span className="truncate">{item.label}</span>
    </button>
  );
}
