import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookMarked,
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  FolderTree,
  Gauge,
  GitBranch,
  GitCommit,
  GitMerge,
  LayoutGrid,
  ListChecks,
  Plug,
  Plus,
  Search,
  Settings as SettingsIcon,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { NotificationRecord, RunStatus } from "../../lib/types.js";
import { EntityIcon } from "../design/EntityIcon.js";
import { ThemeToggle } from "../design/ThemeToggle.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
import { cn } from "../design/cn.js";
import type { NavId } from "./nav-id.js";

type Props = {
  currentNav: NavId;
  onShowHome: () => void;
  onShowCompose: () => void;
  onShowFlows: () => void;
  onShowMetrics: () => void;
  onShowCrew: () => void;
  onShowProviders: () => void;
  onShowSupervisors: () => void;
  onShowProfiles: () => void;
  onShowBoard: () => void;
  onShowRunsList: () => void;
  onShowWorkspace: () => void;
  onShowProposals: () => void;
  onShowProject: () => void;
  onShowConfig: () => void;
  onShowCodebase: () => void;
  onShowGit: () => void;
  onShowGitTree: () => void;
  onShowMerge: () => void;
  onShowLedger: () => void;
  onShowSettings: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
};

const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
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
]);

/**
 * The single app-wide shell navigation. Mission Control is the source of truth
 * for the product's look, so its left sidebar - not the retired horizontal
 * TopBar - is the chrome every page renders inside. The brand block, NavItem /
 * SubItem styling, run-count badges and the New-run CTA are lifted verbatim
 * from `MissionControlPage`; the lower groups absorb every destination the
 * TopBar used to carry (primary rows + a collapsible "More").
 */
export function Sidebar({
  currentNav,
  onShowHome,
  onShowCompose,
  onShowFlows,
  onShowMetrics,
  onShowCrew,
  onShowProviders,
  onShowSupervisors,
  onShowProfiles,
  onShowBoard,
  onShowRunsList,
  onShowWorkspace,
  onShowProposals,
  onShowProject,
  onShowConfig,
  onShowCodebase,
  onShowGit,
  onShowGitTree,
  onShowMerge,
  onShowLedger,
  onShowSettings,
  onOpenNotification,
}: Props) {
  const [counts, setCounts] = useState({ active: 0, mergeReady: 0, failed: 0 });
  const [runsOpen, setRunsOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const runs = await api.listRuns();
        if (cancelled) return;
        setCounts({
          active: runs.filter((r) => ACTIVE_STATUSES.has(r.status)).length,
          mergeReady: runs.filter((r) => r.status === "merge_ready").length,
          failed: runs.filter((r) => r.status === "failed").length,
        });
      } catch {
        /* server may still be warming up */
      }
    };
    void load();
    const id = window.setInterval(load, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const moreActive = useMemo(
    () =>
      (
        [
          "git",
          "merge",
          "providers",
          "supervisors",
          "ledger",
          "proposals",
          "project",
          "config",
          "workspace",
        ] as NavId[]
      ).includes(currentNav),
    [currentNav],
  );

  // Keep the "More" group expanded whenever one of its destinations is active,
  // so the active row is never hidden inside a collapsed section.
  useEffect(() => {
    if (moreActive) setMoreOpen(true);
  }, [moreActive]);

  return (
    <aside className="font-jakarta flex h-full w-[230px] shrink-0 flex-col bg-coal-800 px-4 py-5">
      {/* Brand (verbatim from Mission Control) */}
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <button
          type="button"
          onClick={onShowHome}
          className="flex items-center gap-2.5"
          aria-label="Mission control"
        >
          <span className="h-7 w-7 rounded-[9px] bg-gradient-to-br from-violet-soft to-[#6d4fd4]" />
          <span className="text-[16px] font-extrabold tracking-[-0.01em] text-chalk-100">
            vibestrate
          </span>
        </button>
        <ThemeToggle className="ml-auto h-8 w-8 rounded-[10px]" />
      </div>

      {/* Scrollable nav body; New-run + utility row stay pinned below. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <NavItem
          icon={<LayoutGrid className="h-[18px] w-[18px]" />}
          label="Dashboard"
          selected={currentNav === "home"}
          onClick={onShowHome}
        />

        <button
          type="button"
          onClick={() => setRunsOpen((v) => !v)}
          className={cn(
            "flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[14px]",
            currentNav === "runs"
              ? "bg-coal-500 font-semibold text-chalk-100"
              : "font-bold text-chalk-100",
          )}
        >
          <EntityIcon entity="run" size={18} />
          <span>Runs</span>
          {runsOpen ? (
            <ChevronUp className="ml-auto h-4 w-4 text-chalk-400" />
          ) : (
            <ChevronDown className="ml-auto h-4 w-4 text-chalk-400" />
          )}
        </button>
        {runsOpen ? (
          <div className="mb-1 ml-[22px] flex flex-col gap-0.5 border-l-[1.5px] border-[color:var(--line-strong)] pl-2.5">
            <SubItem label="Active" badge={{ n: counts.active, tone: "violet" }} onClick={onShowRunsList} />
            <SubItem label="Merge-ready" badge={{ n: counts.mergeReady, tone: "emerald" }} onClick={onShowRunsList} />
            <SubItem label="Failed" badge={{ n: counts.failed, tone: "amber" }} onClick={onShowRunsList} />
          </div>
        ) : null}

        <NavItem
          icon={<EntityIcon entity="flow" size={18} />}
          label="Flows"
          selected={currentNav === "flows" || currentNav === "flow"}
          onClick={onShowFlows}
        />
        <NavItem
          icon={<EntityIcon entity="crew" size={18} />}
          label="Crew"
          selected={currentNav === "crew"}
          onClick={onShowCrew}
        />
        <NavItem
          icon={<GitBranch className="h-[18px] w-[18px]" />}
          label="Diffs"
          selected={currentNav === "git-tree"}
          onClick={onShowGitTree}
        />
        <NavItem
          icon={<ListChecks className="h-[18px] w-[18px]" />}
          label="Board"
          selected={currentNav === "board"}
          onClick={onShowBoard}
        />
        <NavItem
          icon={<Gauge className="h-[18px] w-[18px]" />}
          label="Metrics"
          selected={currentNav === "metrics"}
          onClick={onShowMetrics}
        />
        <NavItem
          icon={<SlidersHorizontal className="h-[18px] w-[18px]" />}
          label="Profiles"
          selected={currentNav === "profiles"}
          onClick={onShowProfiles}
        />
        <NavItem
          icon={<FolderTree className="h-[18px] w-[18px]" />}
          label="Codebase"
          selected={currentNav === "codebase"}
          onClick={onShowCodebase}
        />

        {/* More - the long tail the TopBar buried in its own dropdown. */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "mt-1 flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[14px] font-medium",
            moreActive ? "text-chalk-100" : "text-chalk-400 hover:text-chalk-100",
          )}
        >
          <Settings2 className="h-[18px] w-[18px]" />
          <span>More</span>
          {moreOpen ? (
            <ChevronUp className="ml-auto h-4 w-4 text-chalk-400" />
          ) : (
            <ChevronDown className="ml-auto h-4 w-4 text-chalk-400" />
          )}
        </button>
        {moreOpen ? (
          <div className="mb-1 ml-[22px] flex flex-col gap-0.5 border-l-[1.5px] border-[color:var(--line-strong)] pl-2.5">
            <MoreItem icon={<GitCommit className="h-4 w-4" strokeWidth={1.9} />} label="Git" active={currentNav === "git"} onClick={onShowGit} />
            <MoreItem icon={<GitMerge className="h-4 w-4" strokeWidth={1.9} />} label="Merge" active={currentNav === "merge"} onClick={onShowMerge} />
            <MoreItem icon={<Plug className="h-4 w-4" strokeWidth={1.9} />} label="Providers" active={currentNav === "providers"} onClick={onShowProviders} />
            <MoreItem icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.9} />} label="Supervisors" active={currentNav === "supervisors"} onClick={onShowSupervisors} />
            <MoreItem icon={<BookMarked className="h-4 w-4" strokeWidth={1.9} />} label="Ledger" active={currentNav === "ledger"} onClick={onShowLedger} />
            <MoreItem icon={<FileText className="h-4 w-4" strokeWidth={1.9} />} label="Proposals" active={currentNav === "proposals"} onClick={onShowProposals} />
            <MoreItem icon={<Folder className="h-4 w-4" strokeWidth={1.9} />} label="Project" active={currentNav === "project"} onClick={onShowProject} />
            <MoreItem icon={<Settings2 className="h-4 w-4" strokeWidth={1.9} />} label="Config" active={currentNav === "config"} onClick={onShowConfig} />
            <MoreItem icon={<FolderTree className="h-4 w-4" strokeWidth={1.9} />} label="All projects" active={currentNav === "workspace"} onClick={onShowWorkspace} />
          </div>
        ) : null}
      </nav>

      {/* Utility row - the TopBar's right cluster, folded into the shell.
          Sits above New run so it clears the bottom-left CLI launcher pill. */}
      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("vibestrate:help-overlay"))}
          className="flex h-8 flex-1 items-center gap-2 rounded-[10px] border border-[color:var(--line)] bg-coal-700 px-2.5 text-[12px] text-chalk-300 transition hover:bg-coal-600"
          title="Jump to… (⌘K)"
          aria-label="Jump to"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.9} />
          <span>Jump to…</span>
        </button>
        <NotificationBell onOpenNotification={onOpenNotification} onOpenSettings={onShowSettings} />
        <button
          type="button"
          onClick={onShowSettings}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[10px] border border-[color:var(--line)] bg-coal-700 transition hover:bg-coal-600",
            currentNav === "settings" ? "text-chalk-100" : "text-chalk-300",
          )}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>

      {/* New run (verbatim from Mission Control) - stays bottom-most. */}
      <button
        type="button"
        onClick={onShowCompose}
        className="mt-2.5 flex items-center justify-center gap-2 rounded-[12px] bg-violet-soft px-3 py-2.5 text-[13.5px] font-bold text-coal-900 transition hover:bg-violet-soft/90"
      >
        <Plus className="h-4 w-4" /> New run
      </button>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  trailing,
  selected,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[14px] font-medium",
        selected ? "bg-coal-500 font-semibold text-chalk-100" : "text-chalk-400 hover:text-chalk-100",
      )}
    >
      {icon}
      <span>{label}</span>
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </button>
  );
}

const badgeTone: Record<string, string> = {
  violet: "bg-violet-soft/20 text-violet-soft",
  emerald: "bg-emerald-500/[0.18] text-emerald-400",
  amber: "bg-amber-soft/20 text-amber-soft",
};

function SubItem({
  label,
  badge,
  onClick,
}: {
  label: string;
  badge?: { n: number; tone: keyof typeof badgeTone };
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-[9px] px-3 py-2 text-left text-[13px] text-chalk-400 hover:text-chalk-100"
    >
      <span>{label}</span>
      {badge ? (
        <span className={cn("rounded-md px-1.5 py-px text-[11px] font-bold", badgeTone[badge.tone])}>
          {badge.n}
        </span>
      ) : null}
    </button>
  );
}

function MoreItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[13px]",
        active ? "text-chalk-100" : "text-chalk-400 hover:text-chalk-100",
      )}
    >
      <span className={active ? "text-violet-soft" : "text-chalk-400"}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
