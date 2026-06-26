import type { ReactNode } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  GitBranch,
  GitMerge,
  HelpCircle,
  LayoutGrid,
  Play,
  Route,
  Users,
} from "lucide-react";

/**
 * OverviewSurface - first surface in the soft-dark "coal/chalk" design language
 * (approved 2026-06-27): big bold type, airy soft cards, generous whitespace,
 * restrained violet accent with green/red for direction. Built bespoke; the
 * sample numbers are placeholders until this is wired to live run data.
 */
function Sparkline({ d, stroke, className }: { d: string; stroke: string; className?: string }) {
  return (
    <svg viewBox="0 0 160 64" className={className} fill="none" aria-hidden>
      <path d={d} stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavItem({
  icon,
  label,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
}) {
  return (
    <button className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[14px] font-medium text-chalk-400 hover:text-chalk-100">
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
  selected,
  badge,
}: {
  label: string;
  selected?: boolean;
  badge?: { n: number; tone: keyof typeof badgeTone };
}) {
  return (
    <button
      className={`flex items-center justify-between rounded-[9px] px-3 py-2 text-left text-[13px] ${
        selected ? "bg-coal-500 font-semibold text-white" : "text-chalk-400 hover:text-chalk-100"
      }`}
    >
      <span>{label}</span>
      {badge ? (
        <span className={`rounded-md px-1.5 py-px text-[11px] font-bold ${badgeTone[badge.tone]}`}>
          {badge.n}
        </span>
      ) : null}
    </button>
  );
}

export function OverviewSurface() {
  return (
    <div className="font-jakarta flex min-h-screen bg-coal-800 text-chalk-100">
      <aside className="flex w-[244px] shrink-0 flex-col gap-0.5 px-4 py-5">
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <span className="h-7 w-7 rounded-[9px] bg-gradient-to-br from-violet-soft to-[#6d4fd4]" />
          <span className="text-[16px] font-extrabold tracking-[-0.01em] text-chalk-100">
            vibestrate
          </span>
        </div>

        <NavItem icon={<LayoutGrid className="h-[18px] w-[18px]" />} label="Dashboard" />
        <button className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[14px] font-bold text-chalk-100">
          <Play className="h-[18px] w-[18px]" />
          <span>Runs</span>
          <ChevronUp className="ml-auto h-4 w-4 text-chalk-400" />
        </button>
        <div className="ml-[22px] mb-1 flex flex-col gap-0.5 border-l-[1.5px] border-white/[0.08] pl-2.5">
          <SubItem label="Overview" selected />
          <SubItem label="Active" badge={{ n: 4, tone: "violet" }} />
          <SubItem label="Merge-ready" badge={{ n: 2, tone: "emerald" }} />
          <SubItem label="Failed" badge={{ n: 1, tone: "amber" }} />
        </div>
        <NavItem
          icon={<Users className="h-[18px] w-[18px]" />}
          label="Crew"
          trailing={<ChevronDown className="h-4 w-4 text-chalk-400" />}
        />
        <NavItem icon={<Route className="h-[18px] w-[18px]" />} label="Flows" />
        <NavItem icon={<GitBranch className="h-[18px] w-[18px]" />} label="Diffs" />
      </aside>

      <main className="flex-1 px-10 py-8">
        <h1 className="mb-6 text-[30px] font-extrabold tracking-[-0.02em] text-chalk-100">
          Mission overview
        </h1>

        <section className="overflow-hidden rounded-[24px] border border-white/[0.06] bg-coal-600 p-7">
          <h2 className="mb-6 text-[19px] font-bold text-chalk-100">Overview</h2>
          <div className="flex gap-10">
            <div className="shrink-0">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-coal-500 text-violet-soft">
                <Play className="h-5 w-5" />
              </span>
              <div className="flex items-center gap-2 text-chalk-400">
                <span className="text-[15px] font-semibold">Runs this week</span>
                <HelpCircle className="h-[15px] w-[15px] opacity-60" />
              </div>
              <div className="mt-1.5 flex items-end gap-4">
                <span className="text-[58px] font-extrabold leading-none tracking-[-0.03em] text-white">
                  128
                </span>
                <Sparkline
                  d="M2,48 C18,46 26,30 40,30 C54,30 56,12 72,10 C86,9 92,40 108,46 C124,52 136,40 158,38"
                  stroke="#34d399"
                  className="mb-2 h-[52px] w-[160px]"
                />
              </div>
              <div className="mt-4 flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 rounded-[10px] bg-emerald-500/[0.14] px-2.5 py-1 text-[13px] font-bold text-emerald-400">
                  <ArrowUp className="h-3.5 w-3.5" />
                  36.8%
                </span>
                <span className="text-[13px] text-chalk-400">vs last week</span>
              </div>
            </div>

            <div className="min-w-[130px] flex-1 border-l border-white/[0.06] pl-10 opacity-30">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-coal-500 text-chalk-400">
                <GitMerge className="h-5 w-5" />
              </span>
              <div className="text-[15px] font-semibold text-chalk-400">Merged</div>
              <div className="mt-1.5 text-[58px] font-extrabold leading-none tracking-[-0.03em] text-white">
                96
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-white/[0.06] bg-coal-600 p-7">
          <h2 className="text-[19px] font-bold text-chalk-100">Run activity</h2>
          <svg
            viewBox="0 0 800 80"
            className="mt-4 h-16 w-full"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="ds-act" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(139,92,246,0.28)" />
                <stop offset="1" stopColor="rgba(139,92,246,0)" />
              </linearGradient>
            </defs>
            <path
              d="M0,58 L100,48 L200,52 L300,32 L400,40 L500,22 L600,30 L700,14 L800,24 L800,80 L0,80 Z"
              fill="url(#ds-act)"
            />
            <path
              d="M0,58 L100,48 L200,52 L300,32 L400,40 L500,22 L600,30 L700,14 L800,24"
              stroke="#a78bfa"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </section>
      </main>
    </div>
  );
}
