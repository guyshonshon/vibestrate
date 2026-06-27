import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Cpu,
  Plug,
  FileText,
  Folder,
  FolderTree,
  Gauge,
  GitBranch,
  GitCommit,
  GitMerge,
  BookMarked,
  LayoutGrid,
  Library,
  ListChecks,
  Menu,
  Search,
  Settings as SettingsIcon,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../lib/api.js";
import type { NotificationRecord } from "../../lib/types.js";
import { Brand } from "../design/Brand.js";
import { KBD } from "../design/Chip.js";
import { cn } from "../design/cn.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
import { ThemeToggle } from "../design/ThemeToggle.js";
import type { NavId } from "./nav-id.js";

type Props = {
  currentNav: NavId;
  onShowHome: () => void;
  onShowFlows: () => void;
  onShowMetrics: () => void;
  onShowCrew: () => void;
  onShowProviders: () => void;
  onShowSupervisors: () => void;
  onShowProfiles: () => void;
  onShowBoard: () => void;
  onShowRunsList: () => void;
  onShowQueue: () => void;
  onShowWorkspace: () => void;
  onShowProposals: () => void;
  onShowProject: () => void;
  onShowConfig: () => void;
  onShowCodebase: () => void;
  onShowGit: () => void;
  onShowGitTree: () => void;
  onShowMerge: () => void;
  onShowLedger: () => void;
  onShowConsult: () => void;
  onShowSettings: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
};

type ProjectMeta = { root: string | null; branch: string | null };

type NavSpec = {
  id: NavId | "more";
  label: string;
  active: boolean;
  icon: LucideIcon;
  onClick: () => void;
};

/**
 * Mission Control top bar.
 *
 * Single-row at every desktop size. As the viewport narrows, secondary
 * pieces drop into responsive containers rather than wrapping:
 *
 *   ≥ xl (1280+) - full nav row (Mission / Flows / Agents / Metrics /
 *                  Board / Codebase / More) + breadcrumb + Jump-to
 *   md – xl     - primary nav tabs collapse into a single "Menu"
 *                  dropdown; branch chip hides; breadcrumb shows
 *                  brand + project only.
 *   < md         - Jump-to shrinks to icon, breadcrumb hides except
 *                  brand.
 *
 * The whole header is `flex-nowrap` so nothing can wrap a second row.
 */
export function TopBar({
  currentNav,
  onShowHome,
  onShowFlows,
  onShowMetrics,
  onShowCrew,
  onShowProviders,
  onShowSupervisors,
  onShowProfiles,
  onShowBoard,
  onShowRunsList,
  onShowQueue,
  onShowWorkspace,
  onShowProposals,
  onShowProject,
  onShowConfig,
  onShowCodebase,
  onShowGit,
  onShowGitTree,
  onShowMerge,
  onShowLedger,
  onShowConsult,
  onShowSettings,
  onOpenNotification,
}: Props) {
  const [meta, setMeta] = useState<ProjectMeta>({ root: null, branch: null });
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const runs = await api.listRuns();
        if (cancelled) return;
        const sample = runs.find((r) => r.projectRoot) ?? runs[0] ?? null;
        const branch =
          runs.find((r) => r.branchName)?.branchName ?? null;
        setMeta({
          root: sample?.projectRoot ?? null,
          branch,
        });
      } catch {
        /* server may still be warming up */
      }
    };
    void load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Close popovers on outside click.
  useEffect(() => {
    if (!moreOpen && !menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen, menuOpen]);

  const projectLabel = (() => {
    if (!meta.root) return "workspace";
    const parts = meta.root.split("/");
    return parts[parts.length - 1] || meta.root;
  })();

  const navSpecs: NavSpec[] = [
    {
      id: "home",
      label: "Mission",
      active: currentNav === "home" || currentNav === "runs",
      icon: LayoutGrid,
      onClick: onShowHome,
    },
    {
      id: "flows",
      label: "Flows",
      active: currentNav === "flows" || currentNav === "flow",
      icon: Library,
      onClick: onShowFlows,
    },
    {
      id: "crew",
      label: "Crew",
      active: currentNav === "crew",
      icon: Cpu,
      onClick: onShowCrew,
    },
    {
      id: "profiles",
      label: "Profiles",
      active: currentNav === "profiles",
      icon: SlidersHorizontal,
      onClick: onShowProfiles,
    },
    {
      id: "metrics",
      label: "Metrics",
      active: currentNav === "metrics",
      icon: Gauge,
      onClick: onShowMetrics,
    },
    {
      id: "board",
      label: "Board",
      active: currentNav === "board",
      icon: ListChecks,
      onClick: onShowBoard,
    },
    {
      id: "codebase",
      label: "Codebase",
      active: currentNav === "codebase",
      icon: FolderTree,
      onClick: onShowCodebase,
    },
  ];

  return (
    <header className="relative z-20 flex flex-nowrap items-center gap-2 sm:gap-3 border-b border-[color:var(--line)] bg-coal-800 px-3 sm:px-6 py-3">
      {/* ── Brand + breadcrumb (left) ───────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0 shrink">
        <button
          type="button"
          onClick={onShowHome}
          className="flex items-center gap-2.5 shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-soft/50"
        >
          <Brand />
        </button>
        <span className="text-chalk-400 hidden md:inline">/</span>
        <button
          type="button"
          onClick={onShowProject}
          className="hidden md:flex items-center gap-1.5 text-[13px] text-chalk-300 hover:text-chalk-100 min-w-0"
        >
          <Folder
            className="h-3.5 w-3.5 text-chalk-400 shrink-0"
            strokeWidth={1.9}
          />
          <span className="truncate max-w-[160px]">{projectLabel}</span>
        </button>
        <WorkspaceSwitcher onShowOverview={onShowWorkspace} />
        {meta.branch ? (
          <>
            <span className="text-chalk-400 hidden xl:inline">/</span>
            <button
              type="button"
              onClick={onShowGit}
              className="hidden xl:flex items-center gap-1.5 text-[13px] text-chalk-300 hover:text-chalk-100 min-w-0"
            >
              <GitBranch
                className="h-3.5 w-3.5 text-chalk-400 shrink-0"
                strokeWidth={1.9}
              />
              <span className="mono text-[12px] truncate max-w-[160px]">
                {meta.branch}
              </span>
              <ChevronDown
                className="h-3.5 w-3.5 text-chalk-400 shrink-0"
                strokeWidth={1.9}
              />
            </button>
          </>
        ) : null}
      </div>

      {/* ── Nav tabs (xl+) ──────────────────────────────────────────── */}
      <nav className="hidden xl:flex items-center gap-1 mx-auto">
        {navSpecs.map((spec) => (
          <NavTab
            key={spec.id}
            active={spec.active}
            onClick={spec.onClick}
            icon={<spec.icon className="h-3.5 w-3.5" strokeWidth={1.6} />}
          >
            {spec.label}
          </NavTab>
        ))}
        <div ref={moreRef} className="relative">
          <NavTab
            active={
              currentNav === "git" ||
              currentNav === "git-tree" ||
              currentNav === "merge" ||
              currentNav === "providers" ||
              currentNav === "supervisors" ||
              currentNav === "ledger" ||
              currentNav === "proposals" ||
              currentNav === "project" ||
              currentNav === "config"
            }
            onClick={() => setMoreOpen((x) => !x)}
            icon={<Cpu className="h-3.5 w-3.5" strokeWidth={1.6} />}
          >
            More
            <ChevronDown
              className="ml-1 h-3 w-3 text-chalk-400"
              strokeWidth={1.9}
            />
          </NavTab>
          {moreOpen ? (
            <div className="absolute right-0 top-full mt-2 z-30 menu-surface overflow-hidden py-1 min-w-[200px]">
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowGit();
                }}
                icon={<GitCommit className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Git
              </DropItem>
              <DropItem
                active={currentNav === "git-tree"}
                onClick={() => {
                  setMoreOpen(false);
                  onShowGitTree();
                }}
                icon={<GitMerge className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Git tree
              </DropItem>
              <DropItem
                active={currentNav === "merge"}
                onClick={() => {
                  setMoreOpen(false);
                  onShowMerge();
                }}
                icon={<GitMerge className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Merge
              </DropItem>
              <DropItem
                active={currentNav === "providers"}
                onClick={() => {
                  setMoreOpen(false);
                  onShowProviders();
                }}
                icon={<Plug className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Providers
              </DropItem>
              <DropItem
                active={currentNav === "supervisors"}
                onClick={() => {
                  setMoreOpen(false);
                  onShowSupervisors();
                }}
                icon={<ShieldCheck className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Supervisors
              </DropItem>
              <DropItem
                active={currentNav === "ledger"}
                onClick={() => {
                  setMoreOpen(false);
                  onShowLedger();
                }}
                icon={<BookMarked className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Ledger
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowProposals();
                }}
                icon={<FileText className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Proposals
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowProject();
                }}
                icon={<Folder className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Project
              </DropItem>
              <DropItem
                active={currentNav === "config"}
                onClick={() => {
                  setMoreOpen(false);
                  onShowConfig();
                }}
                icon={<Settings2 className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                Config
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowWorkspace();
                }}
                icon={<FolderTree className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                All projects
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowRunsList();
                }}
                icon={<ListChecks className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
              >
                All runs
              </DropItem>
            </div>
          ) : null}
        </div>
      </nav>

      {/* ── Collapsed nav menu (< xl) ────────────────────────────── */}
      <div ref={menuRef} className="xl:hidden relative mx-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((x) => !x)}
          aria-label="Open navigation"
          className={cn(
            "h-8 px-3 flex items-center gap-1.5 text-[12.5px] font-medium",
            menuOpen
              ? "bg-coal-500 text-chalk-100 border border-[color:var(--line-strong)]"
              : "text-chalk-300 hover:text-chalk-100 hover:bg-coal-600 border border-[color:var(--line)]",
          )}
        >
          <Menu className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.6} />
          <span className="hidden sm:inline">
            {navSpecs.find((n) => n.active)?.label ?? "Menu"}
          </span>
          <ChevronDown
            className="h-3 w-3 text-chalk-400"
            strokeWidth={1.9}
          />
        </button>
        {menuOpen ? (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 menu-surface overflow-hidden py-1 min-w-[220px]">
            {navSpecs.map((spec) => (
              <DropItem
                key={spec.id}
                active={spec.active}
                onClick={() => {
                  setMenuOpen(false);
                  spec.onClick();
                }}
                icon={
                  <spec.icon
                    className={cn(
                      "h-3.5 w-3.5",
                      spec.active ? "text-violet-soft" : "text-chalk-400",
                    )}
                    strokeWidth={1.9}
                  />
                }
              >
                {spec.label}
              </DropItem>
            ))}
            <div className="border-t border-[color:var(--line)] my-1" />
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowGit();
              }}
              icon={<GitCommit className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Git
            </DropItem>
            <DropItem
              active={currentNav === "git-tree"}
              onClick={() => {
                setMenuOpen(false);
                onShowGitTree();
              }}
              icon={<GitMerge className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Git tree
            </DropItem>
            <DropItem
              active={currentNav === "merge"}
              onClick={() => {
                setMenuOpen(false);
                onShowMerge();
              }}
              icon={<GitMerge className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Merge
            </DropItem>
            <DropItem
              active={currentNav === "providers"}
              onClick={() => {
                setMenuOpen(false);
                onShowProviders();
              }}
              icon={<Plug className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Providers
            </DropItem>
            <DropItem
              active={currentNav === "supervisors"}
              onClick={() => {
                setMenuOpen(false);
                onShowSupervisors();
              }}
              icon={<ShieldCheck className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Supervisors
            </DropItem>
            <DropItem
              active={currentNav === "ledger"}
              onClick={() => {
                setMenuOpen(false);
                onShowLedger();
              }}
              icon={<BookMarked className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Ledger
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowProposals();
              }}
              icon={<FileText className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Proposals
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowProject();
              }}
              icon={<Folder className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Project
            </DropItem>
            <DropItem
              active={currentNav === "config"}
              onClick={() => {
                setMenuOpen(false);
                onShowConfig();
              }}
              icon={<Settings2 className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              Config
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowWorkspace();
              }}
              icon={<FolderTree className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              All projects
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowRunsList();
              }}
              icon={<ListChecks className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />}
            >
              All runs
            </DropItem>
          </div>
        ) : null}
      </div>

      {/* ── Right cluster (jump-to / bell / settings / avatar) ──
          Consult moved to the floating orb dock (bottom-right, ConsultDock),
          so it is no longer a top-bar button. */}
      <div className="flex items-center gap-2 shrink-0 ml-auto xl:ml-0">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("vibestrate:help-overlay"))
          }
          className="h-8 px-2.5 border border-[color:var(--line-strong)] bg-coal-700 hover:bg-coal-600 flex items-center gap-2 text-[12px] text-chalk-300 whitespace-nowrap"
          title="Jump to… (⌘K)"
          aria-label="Jump to"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.9} />
          <span className="hidden lg:inline">Jump to…</span>
          <span className="hidden lg:flex items-center gap-1">
            <KBD>⌘</KBD>
            <KBD>K</KBD>
          </span>
        </button>
        <ThemeToggle className="h-8 w-8 rounded-[10px] border border-[color:var(--line)]" />
        <NotificationBell
          onOpenNotification={onOpenNotification}
          onOpenSettings={onShowSettings}
        />
        <button
          type="button"
          onClick={onShowSettings}
          className={cn(
            "w-8 h-8 border border-[color:var(--line-strong)] bg-coal-700 hover:bg-coal-600 flex items-center justify-center shrink-0",
            currentNav === "settings" ? "text-chalk-100" : "text-chalk-300",
          )}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon className="h-4 w-4" strokeWidth={1.6} />
        </button>
        <button
          type="button"
          onClick={onShowSettings}
          className="w-8 h-8 overflow-hidden border border-[color:var(--line-strong)] bg-violet-soft flex items-center justify-center text-[11px] font-semibold text-coal-900 shrink-0"
        >
          AM
        </button>
      </div>
    </header>
  );
}

function NavTab({
  children,
  active,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 px-3 flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap",
        active
          ? "bg-coal-600 text-chalk-100 border border-[color:var(--line-strong)]"
          : "text-chalk-300 hover:text-chalk-100 hover:bg-coal-600 border border-transparent",
      )}
    >
      <span className={active ? "text-violet-soft" : "text-chalk-400"}>
        {icon}
      </span>
      {children}
    </button>
  );
}

function DropItem({
  children,
  icon,
  onClick,
  active,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 flex items-center gap-2 text-[13px]",
        active
          ? "bg-violet-soft/[0.08] text-chalk-100"
          : "text-chalk-300 hover:bg-coal-600 hover:text-chalk-100",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

type WsProject = {
  root: string;
  label: string;
  lastPort: number | null;
  lastOpenedAt: string;
  current: boolean;
  live: boolean;
};

/**
 * Project switcher (multi-project v1): lists registered projects and hops to
 * another project's dashboard (its own `vibe ui` on its own port). Local-first
 * - each project is an independent dashboard; this just makes them switchable.
 */
function WorkspaceSwitcher({ onShowOverview }: { onShowOverview: () => void }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<WsProject[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .listWorkspace()
      .then((r) => setProjects(r.projects))
      .catch(() => setProjects([]));
  }, [open]);

  // Open a project's own dashboard in a new tab - starting it (server +
  // scheduler) if it's dormant. Keeps each project a fully isolated tenant.
  const openProject = async (p: WsProject) => {
    if (p.current) return;
    setBusy(p.root);
    try {
      const r = await api.openWorkspaceProject(p.root);
      window.open(r.url, "_blank");
      setOpen(false);
    } catch {
      // leave the menu open; the row stays clickable to retry
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Only one project known ⇒ nothing to switch to; keep the chrome quiet.
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Switch project"
        className="flex items-center text-chalk-400 hover:text-chalk-300"
      >
        <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
      </button>
      {open ? (
        <div className="absolute left-0 top-7 z-50 w-[280px] border border-[color:var(--line)] bg-coal-800 p-1 shadow-xl">
          <div className="px-2 py-1 mono text-[11px] text-chalk-400">
            Projects ({projects.length})
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onShowOverview();
            }}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-coal-600"
          >
            <FolderTree className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} />
            <span className="flex-1 text-[12.5px] text-chalk-100">All projects overview</span>
          </button>
          <div className="my-1 border-t border-[color:var(--line)]" />
          {projects.length === 0 ? (
            <div className="px-2 py-2 text-[11.5px] text-chalk-300">
              Only this project is registered. Run <span className="mono">vibe ui</span> in another to add it.
            </div>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto">
              {projects.map((p) => (
                <li key={p.root}>
                  <button
                    type="button"
                    disabled={p.current || busy === p.root}
                    onClick={() => void openProject(p)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-coal-600 disabled:hover:bg-transparent"
                    title={
                      p.current
                        ? "Current project"
                        : p.live
                          ? "Open in a new tab"
                          : "Start this project and open it"
                    }
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        p.current || p.live ? "bg-emerald-400" : "bg-chalk-400",
                      )}
                    />
                    <Folder className="h-3.5 w-3.5 shrink-0 text-chalk-400" strokeWidth={1.9} />
                    <span className="flex-1 truncate text-[12.5px] text-chalk-100">{p.label}</span>
                    {p.current ? (
                      <span className="text-[10px] text-emerald-400">current</span>
                    ) : busy === p.root ? (
                      <span className="text-[10px] text-chalk-400">starting…</span>
                    ) : p.live ? (
                      <span className="mono text-[10px] text-chalk-400">:{p.lastPort} ↗</span>
                    ) : (
                      <span className="text-[10px] text-chalk-400">launch ↗</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
