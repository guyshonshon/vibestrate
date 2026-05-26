import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Cpu,
  FileText,
  Folder,
  FolderTree,
  Gauge,
  GitBranch,
  GitCommit,
  LayoutGrid,
  Layers,
  Library,
  ListChecks,
  Menu,
  Plug,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../lib/api.js";
import type { NotificationRecord } from "../../lib/types.js";
import { Brand } from "../design/Brand.js";
import { KBD } from "../design/Chip.js";
import { cn } from "../design/cn.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
import type { NavId } from "./nav-id.js";

type Props = {
  currentNav: NavId;
  onShowHome: () => void;
  onShowFlows: () => void;
  onShowGuides: () => void;
  onShowMetrics: () => void;
  onShowAgents: () => void;
  onShowProviders: () => void;
  onShowBoard: () => void;
  onShowRunsList: () => void;
  onShowQueue: () => void;
  onShowProposals: () => void;
  onShowProject: () => void;
  onShowCodebase: () => void;
  onShowGit: () => void;
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
 *   ≥ xl (1280+) — full nav row (Mission / Flows / Agents / Metrics /
 *                  Board / Codebase / More) + breadcrumb + Jump-to
 *   md – xl     — primary nav tabs collapse into a single "Menu"
 *                  dropdown; branch chip hides; breadcrumb shows
 *                  brand + project only.
 *   < md         — Jump-to shrinks to icon, breadcrumb hides except
 *                  brand.
 *
 * The whole header is `flex-nowrap` so nothing can wrap a second row.
 */
export function TopBar({
  currentNav,
  onShowHome,
  onShowFlows,
  onShowGuides,
  onShowMetrics,
  onShowAgents,
  onShowProviders,
  onShowBoard,
  onShowRunsList,
  onShowQueue,
  onShowProposals,
  onShowProject,
  onShowCodebase,
  onShowGit,
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
      id: "flow",
      label: "Flows",
      active: currentNav === "flow",
      icon: Layers,
      onClick: onShowFlows,
    },
    {
      id: "guides",
      label: "Guides",
      active: currentNav === "guides",
      icon: Library,
      onClick: onShowGuides,
    },
    {
      id: "agents",
      label: "Agents",
      active: currentNav === "agents",
      icon: Cpu,
      onClick: onShowAgents,
    },
    {
      id: "providers",
      label: "Providers",
      active: currentNav === "providers",
      icon: Plug,
      onClick: onShowProviders,
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
    <header className="relative z-20 flex flex-nowrap items-center gap-2 sm:gap-3 border-b border-white/[0.06] surface-ink-0-60 px-3 sm:px-6 py-3 backdrop-blur-xl">
      {/* ── Brand + breadcrumb (left) ───────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0 shrink">
        <button
          type="button"
          onClick={onShowHome}
          className="flex items-center gap-2.5 shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-soft/50 rounded-md"
        >
          <Brand />
        </button>
        <span className="text-fog-500 hidden md:inline">/</span>
        <button
          type="button"
          onClick={onShowProject}
          className="hidden md:flex items-center gap-1.5 text-[13px] text-fog-200 hover:text-fog-100 min-w-0"
        >
          <Folder
            className="h-3.5 w-3.5 text-fog-400 shrink-0"
            strokeWidth={1.7}
          />
          <span className="truncate max-w-[160px]">{projectLabel}</span>
          <ChevronDown
            className="h-3.5 w-3.5 text-fog-500 shrink-0"
            strokeWidth={1.7}
          />
        </button>
        {meta.branch ? (
          <>
            <span className="text-fog-500 hidden xl:inline">/</span>
            <button
              type="button"
              onClick={onShowGit}
              className="hidden xl:flex items-center gap-1.5 text-[13px] text-fog-200 hover:text-fog-100 min-w-0"
            >
              <GitBranch
                className="h-3.5 w-3.5 text-fog-400 shrink-0"
                strokeWidth={1.7}
              />
              <span className="mono text-[12px] truncate max-w-[160px]">
                {meta.branch}
              </span>
              <ChevronDown
                className="h-3.5 w-3.5 text-fog-500 shrink-0"
                strokeWidth={1.7}
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
              currentNav === "proposals" ||
              currentNav === "project"
            }
            onClick={() => setMoreOpen((x) => !x)}
            icon={<Cpu className="h-3.5 w-3.5" strokeWidth={1.6} />}
          >
            More
            <ChevronDown
              className="ml-1 h-3 w-3 text-fog-500"
              strokeWidth={1.7}
            />
          </NavTab>
          {moreOpen ? (
            <div className="absolute right-0 top-full mt-2 z-30 menu-surface overflow-hidden py-1 min-w-[200px]">
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowGit();
                }}
                icon={<GitCommit className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
              >
                Git
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowProposals();
                }}
                icon={<FileText className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
              >
                Proposals
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowProject();
                }}
                icon={<Folder className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
              >
                Project
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowRunsList();
                }}
                icon={<ListChecks className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
              >
                All runs
              </DropItem>
              <DropItem
                onClick={() => {
                  setMoreOpen(false);
                  onShowQueue();
                }}
                icon={<Gauge className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
              >
                Queue
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
            "h-8 px-3 rounded-lg flex items-center gap-1.5 text-[12.5px] font-medium",
            menuOpen
              ? "bg-white/[0.06] text-fog-100 border border-white/10"
              : "text-fog-200 hover:text-fog-100 hover:bg-white/[0.04] border border-white/[0.06]",
          )}
        >
          <Menu className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.6} />
          <span className="hidden sm:inline">
            {navSpecs.find((n) => n.active)?.label ?? "Menu"}
          </span>
          <ChevronDown
            className="h-3 w-3 text-fog-500"
            strokeWidth={1.7}
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
                      spec.active ? "text-violet-soft" : "text-fog-400",
                    )}
                    strokeWidth={1.7}
                  />
                }
              >
                {spec.label}
              </DropItem>
            ))}
            <div className="border-t border-white/[0.05] my-1" />
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowGit();
              }}
              icon={<GitCommit className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
            >
              Git
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowProposals();
              }}
              icon={<FileText className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
            >
              Proposals
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowProject();
              }}
              icon={<Folder className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
            >
              Project
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowRunsList();
              }}
              icon={<ListChecks className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
            >
              All runs
            </DropItem>
            <DropItem
              onClick={() => {
                setMenuOpen(false);
                onShowQueue();
              }}
              icon={<Gauge className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />}
            >
              Queue
            </DropItem>
          </div>
        ) : null}
      </div>

      {/* ── Right cluster (jump-to / bell / settings / avatar) ────── */}
      <div className="flex items-center gap-2 shrink-0 ml-auto xl:ml-0">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("amaco:help-overlay"))
          }
          className="h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center gap-2 text-[12px] text-fog-300 whitespace-nowrap"
          title="Jump to… (⌘K)"
          aria-label="Jump to"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.7} />
          <span className="hidden lg:inline">Jump to…</span>
          <span className="hidden lg:flex items-center gap-1">
            <KBD>⌘</KBD>
            <KBD>K</KBD>
          </span>
        </button>
        <NotificationBell
          onOpenNotification={onOpenNotification}
          onOpenSettings={onShowSettings}
        />
        <button
          type="button"
          onClick={onShowSettings}
          className={cn(
            "w-8 h-8 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center shrink-0",
            currentNav === "settings" ? "text-fog-100" : "text-fog-300",
          )}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon className="h-4 w-4" strokeWidth={1.6} />
        </button>
        <button
          type="button"
          onClick={onShowSettings}
          className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 bg-gradient-to-br from-violet-deep to-sky-500/40 flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
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
        "h-8 px-3 rounded-lg flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap",
        active
          ? "bg-white/[0.06] text-fog-100 border border-white/10"
          : "text-fog-300 hover:text-fog-100 hover:bg-white/[0.04] border border-transparent",
      )}
    >
      <span className={active ? "text-violet-soft" : "text-fog-400"}>
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
          ? "bg-violet-soft/[0.08] text-fog-100"
          : "text-fog-200 hover:bg-white/[0.05] hover:text-fog-100",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
