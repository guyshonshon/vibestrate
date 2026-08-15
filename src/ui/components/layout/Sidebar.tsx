import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { countByFilter, isActiveStatus, type RunFilter } from "../../lib/run-filter.js";
import { navigate } from "../../app/App.js";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  FolderTree,
  Gauge,
  GitBranch,
  LayoutGrid,
  ListChecks,
  Plus,
  Scale,
  Search,
  Settings as SettingsIcon,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "../../lib/api.js";
import type { NotificationRecord, RunState, RunStatus } from "../../lib/types.js";
import { EntityIcon } from "../design/EntityIcon.js";
import { ThemeToggle } from "../design/ThemeToggle.js";
import { NotificationBell } from "../notifications/NotificationBell.js";
import { cn } from "../design/cn.js";
import type { NavId } from "./nav-id.js";

/** An active run that is NOT progressing: it is stopped, or it is blocked on a
 *  decision from you. The card's colour carries this, so the row needs no status
 *  sentence beside it - but the distinction itself must survive, because
 *  "working" and "waiting for you" are the only two things worth telling apart
 *  at a glance. */
function needsYou(status: RunStatus): boolean {
  return status === "waiting_for_approval" || status === "paused";
}

type Props = {
  currentNav: NavId;
  onShowHome: () => void;
  onShowDashboard: () => void;
  onShowCompose: () => void;
  onShowFlows: () => void;
  onShowMetrics: () => void;
  onShowCrew: () => void;
  onShowSupervisors: () => void;
  onShowProfiles: () => void;
  onShowBoard: () => void;
  onShowRunsList: (status?: RunFilter) => void;
  onShowWorkspace: () => void;
  onShowProposals: () => void;
  onShowProject: () => void;
  onShowConfig: () => void;
  onShowCodebase: () => void;
  onShowSource: () => void;
  onShowSettings: () => void;
  onShowPolicies: () => void;
  onOpenNotification: (n: NotificationRecord) => void;
  onOpenSwitcher: () => void;
};


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
  onShowDashboard,
  onShowCompose,
  onShowFlows,
  onShowMetrics,
  onShowCrew,
  onShowSupervisors,
  onShowProfiles,
  onShowBoard,
  onShowRunsList,
  onShowWorkspace,
  onShowProposals,
  onShowProject,
  onShowConfig,
  onShowCodebase,
  onShowSource,
  onShowSettings,
  onShowPolicies,
  onOpenNotification,
  onOpenSwitcher,
}: Props) {
  const [counts, setCounts] = useState({ active: 0, mergeReady: 0, failed: 0 });
  const [live, setLive] = useState<RunState[]>([]);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [runsOpen, setRunsOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    // Once per mount: the served version cannot change without a restart, which
    // would remount this anyway.
    let dropped = false;
    void api
      .getAppVersion()
      .then((r) => {
        if (!dropped) setAppVersion(r.version);
      })
      .catch(() => {
        /* a version line is not worth surfacing an error for */
      });
    return () => {
      dropped = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const runs = await api.listRuns();
        if (cancelled) return;
        setLive(
          runs
            .filter((r) => isActiveStatus(r.status))
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .slice(0, 4),
        );
        setCounts({
          active: countByFilter(runs, "active"),
          mergeReady: countByFilter(runs, "merge-ready"),
          failed: countByFilter(runs, "failed"),
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
          "supervisors",
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
          {/* The real mark. Violet on transparent, so it needs no theme
              treatment; percentage radius keeps the corners proportional if the
              size changes. */}
          <img
            src="./logo-icon.png"
            alt=""
            className="h-7 w-7 shrink-0 rounded-[22%]"
            decoding="async"
          />
          {/* The wordmark asset, not set text. It is a WHITE glyph, so it is
              correct untouched on dark and gets darkened on light by
              `.brand-wordmark` (see index.css, which also carries the
              transition). The alt keeps the name available to search and screen
              readers now that it is no longer live text. */}
          <img
            src="./logo-wordmark.png"
            alt="vibestrate"
            className="brand-wordmark h-[15px] w-auto shrink-0"
            decoding="async"
          />
        </button>
        <ThemeToggle className="ml-auto h-8 w-8 shrink-0 rounded-[10px]" />
      </div>

      {/* Which project this dashboard is serving, and the way to another one. */}
      <ProjectSwitcher onShowWorkspace={onShowWorkspace} onShowSource={onShowSource} />

      {/* Scrollable nav body; New-run + utility row stay pinned below. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {/* Live runs sit ABOVE everything. Runs are genuinely concurrent here,
            so this is a list rather than a single row, and each one is the way
            into its own cockpit. */}
        {live.length > 0 ? (
          <div className="mb-1.5 flex flex-col gap-1">
            {live.map((r) => (
              <button
                key={r.runId}
                type="button"
                onClick={() => navigate({ kind: "run", runId: r.runId })}
                className={cn(
                  "live-flash flex items-center gap-2.5 rounded-[11px] border px-3 py-2 text-left",
                  needsYou(r.status) ? "border-amber-soft/45" : "border-emerald/40",
                )}
                style={{
                  backgroundColor: needsYou(r.status)
                    ? "color-mix(in srgb, var(--color-amber-soft) 12%, transparent)"
                    : "color-mix(in srgb, var(--emerald) 8%, transparent)",
                }}
                title={`${r.displayName || r.task} - ${r.status.replace(/_/g, " ")}`}
              >
                {/* No status dot: the green card IS the liveness signal, and a
                    dot beside it says the same thing twice. The word below the
                    title carries WHICH live state, which the colour cannot. */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-chalk-100">
                    {r.displayName || r.task}
                  </span>

                </span>
              </button>
            ))}
          </div>
        ) : null}
        <NavItem
          icon={<LayoutGrid className="h-[18px] w-[18px]" />}
          label="Mission control"
          selected={currentNav === "home"}
          onClick={onShowHome}
        />
        <NavItem
          icon={<Gauge className="h-[18px] w-[18px]" />}
          label="Dashboard"
          selected={currentNav === "dashboard"}
          onClick={onShowDashboard}
        />

        <button
          type="button"
          data-tour="nav-runs"
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
            <SubItem label="Active" badge={{ n: counts.active, tone: "violet" }} onClick={() => onShowRunsList("active")} />
            <SubItem label="Merge-ready" badge={{ n: counts.mergeReady, tone: "emerald" }} onClick={() => onShowRunsList("merge-ready")} />
            <SubItem label="Failed" badge={{ n: counts.failed, tone: "amber" }} onClick={() => onShowRunsList("failed")} />
          </div>
        ) : null}

        <NavItem
          icon={<EntityIcon entity="flow" size={18} />}
          label="Flows"
          selected={currentNav === "flows" || currentNav === "flow"}
          onClick={onShowFlows}
          tourId="nav-flows"
        />
        <NavItem
          icon={<EntityIcon entity="crew" size={18} />}
          label="Crew"
          selected={currentNav === "crew"}
          onClick={onShowCrew}
        />
        {/* Top-level, not inside More: policies are the one surface where the
            owner's rules outrank the model's judgment, so they must be findable
            without knowing to look. */}
        <NavItem
          icon={<Scale className="h-[18px] w-[18px]" />}
          label="Policies"
          selected={currentNav === "policies"}
          onClick={onShowPolicies}
          tourId="nav-policies"
        />
        <NavItem
          icon={<GitBranch className="h-[18px] w-[18px]" />}
          label="Source"
          selected={currentNav === "source"}
          onClick={onShowSource}
        />
        <NavItem
          icon={<ListChecks className="h-[18px] w-[18px]" />}
          label="Board"
          selected={currentNav === "board"}
          onClick={onShowBoard}
          tourId="nav-board"
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
            <MoreItem icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.9} />} label="Supervisors" active={currentNav === "supervisors"} onClick={onShowSupervisors} />
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
          onClick={onOpenSwitcher}
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
        data-tour="nav-new-run"
        onClick={onShowCompose}
        className="mt-2.5 flex items-center justify-center gap-2 rounded-[12px] bg-violet-soft px-3 py-2.5 text-[13.5px] font-bold text-coal-900 transition hover:bg-violet-soft/90"
      >
        <Plus className="h-4 w-4" /> New run
      </button>

      {/* Build stamp, bottom-left corner. Labelled rather than a bare number,
          which on its own read as a stray figure wherever it was put. Read from
          the server rather than baked into this bundle, so a tab left open
          overnight shows the version actually answering it, not the one it was
          built from. Silent when unreadable - not worth an error. */}
      {appVersion ? (
        <div className="mt-2 pl-1 text-meta tabular-nums leading-none text-chalk-400/70">
          build {appVersion}
        </div>
      ) : null}

    </aside>
  );
}

function NavItem({
  icon,
  label,
  trailing,
  selected,
  onClick,
  tourId,
}: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  tourId?: string;
}) {
  return (
    <button
      type="button"
      data-tour={tourId}
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
        <span className={cn("rounded-[6px] px-1.5 py-px text-meta font-bold", badgeTone[badge.tone])}>
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
